import { publicUrl } from '@/lib/items/fetch-url'
import {
  fetchLinkMetadata,
  type StoredImage,
  validateImage,
} from '@/lib/items/link-metadata'
import {
  type ItemOrigin,
  type ItemStatus,
  type ItemType,
  normalizeTagName,
} from '@/lib/items/model'

export interface IngestInput {
  description?: string
  image?: StoredImage
  note?: string
  origin: ItemOrigin
  sourceUrl?: string
  status: ItemStatus
  tags?: string[]
  title?: string
  type: ItemType
}

interface SavedItem {
  description: string
  id: string
  note: string | null
  source_url: string | null
  status: ItemStatus
  title: string | null
  type: ItemType
}

export interface IngestResult {
  duplicate: boolean
  item: SavedItem & { tags: string[] }
}

function validateInput(input: IngestInput) {
  if (
    !(
      ['image', 'link', 'note'].includes(input.type) &&
      ['manual', 'agent'].includes(input.origin) &&
      ['published', 'inbox'].includes(input.status)
    )
  ) {
    throw new Error('Invalid item type, origin or status.')
  }
  for (const value of [
    input.title,
    input.description,
    input.note,
    input.sourceUrl,
  ]) {
    if (
      value !== undefined &&
      (typeof value !== 'string' || value.length > 10_000)
    ) {
      throw new Error('Item text must be at most 10,000 characters.')
    }
  }
  if (
    input.tags !== undefined &&
    (!Array.isArray(input.tags) ||
      input.tags.length > 50 ||
      input.tags.some(tag => typeof tag !== 'string' || tag.length > 100))
  ) {
    throw new Error('Use up to 50 tags, each at most 100 characters.')
  }
  if (input.type === 'note' && !input.note?.trim()) {
    throw new Error('Write a note first.')
  }
  if (input.type === 'image' && !input.image) {
    throw new Error('Choose an image first.')
  }
  if (input.type === 'link' && !input.sourceUrl) {
    throw new Error('Paste a URL first.')
  }
  if (input.image) {
    validateImage(input.image)
  }
}

export async function ingestItem(
  { db, bucket }: { db: D1Database; bucket: Pick<R2Bucket, 'put' | 'delete'> },
  input: IngestInput,
): Promise<IngestResult> {
  validateInput(input)
  const sourceUrl = input.sourceUrl ? publicUrl(input.sourceUrl).href : null
  const tags = [
    ...new Set((input.tags ?? []).map(normalizeTagName).filter(Boolean)),
  ]
  const id = crypto.randomUUID()
  let { image } = input
  let title = input.title?.trim() || null
  let description = input.description?.trim() ?? ''
  const existing = sourceUrl
    ? await db
        .prepare('SELECT id FROM items WHERE source_url = ? LIMIT 1')
        .bind(sourceUrl)
        .first<{ id: string }>()
    : null
  if (input.type === 'link' && !existing) {
    const metadata = await fetchLinkMetadata(sourceUrl as string)
    ;({ image } = metadata)
    title ||= metadata.title
    description ||= metadata.description
  }
  const hash = image
    ? Array.from(
        new Uint8Array(
          await crypto.subtle.digest('SHA-256', new Uint8Array(image.bytes)),
        ),
        byte => byte.toString(16).padStart(2, '0'),
      ).join('')
    : null
  const key = image ? `items/${id}` : null
  const match =
    'SELECT id FROM items WHERE id = ?1 OR (?2 IS NOT NULL AND source_url = ?2) OR (?3 IS NOT NULL AND content_hash = ?3) ORDER BY CASE WHEN source_url = ?2 THEN 0 ELSE 1 END, created_at, id LIMIT 1'
  const matchValues = [id, sourceUrl, hash]
  if (image && key) {
    await bucket.put(key, image.bytes, {
      httpMetadata: { contentType: image.contentType },
    })
  }
  let saved: SavedItem | null = null
  try {
    const now = Date.now()
    const statements = [
      db
        .prepare(`INSERT INTO items (id, type, title, description, note, source_url, origin, status, content_hash, image_key, created_at, updated_at, published_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (
        SELECT 1 FROM items WHERE (?14 IS NOT NULL AND source_url = ?14)
          OR (?15 IS NOT NULL AND content_hash = ?15)
      )`)
        .bind(
          id,
          input.type,
          title,
          description,
          input.note?.trim() || null,
          sourceUrl,
          input.origin,
          input.status,
          hash,
          key,
          now,
          now,
          input.status === 'published' ? now : null,
          sourceUrl,
          hash,
        ),
    ]
    for (const tag of tags) {
      statements.push(
        db
          .prepare(
            'INSERT INTO tags (name, normalized_name) VALUES (?, ?) ON CONFLICT DO NOTHING',
          )
          .bind(tag, tag),
        db
          .prepare(
            `INSERT INTO item_tags (item_id, tag_id) SELECT (${match}), id FROM tags WHERE normalized_name = ?4 ON CONFLICT DO NOTHING`,
          )
          .bind(...matchValues, tag),
      )
    }
    await db.batch(statements)
    saved = await db
      .prepare(
        `SELECT id, type, title, description, note, source_url, status FROM items WHERE id = (${match})`,
      )
      .bind(...matchValues)
      .first<SavedItem>()
    if (!saved) {
      throw new Error('The item could not be saved.')
    }
  } finally {
    if (key && saved?.id !== id) {
      const owned = await db
        .prepare('SELECT id FROM items WHERE image_key = ?')
        .bind(key)
        .first()
      if (!owned) {
        await bucket.delete(key)
      }
    }
  }
  const result = await db
    .prepare(
      'SELECT t.name FROM tags t JOIN item_tags it ON it.tag_id = t.id WHERE it.item_id = ? ORDER BY t.name',
    )
    .bind(saved.id)
    .all<{ name: string }>()
  return {
    duplicate: saved.id !== id,
    item: { ...saved, tags: result.results.map(tag => tag.name) },
  }
}
