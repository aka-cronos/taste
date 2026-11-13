import {
  DiscardedSourceError,
  findDiscard,
  forgetDiscardsStatement,
  type SourceKey,
} from '@/lib/items/discards'
import { publicUrl } from '@/lib/items/fetch-url'
import { type ItemInput, itemInputSchema } from '@/lib/items/input'
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

export type IngestInput = Omit<ItemInput, 'image'> & { image?: StoredImage }

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
  const result = itemInputSchema.safeParse({
    ...input,
    image: input.image
      ? new File([new Uint8Array(input.image.bytes)], 'image', {
          type: input.image.contentType,
        })
      : undefined,
  })
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message)
  }
  if (input.image) {
    validateImage(input.image)
  }
}

async function originalImageHash(
  type: ItemType,
  image: StoredImage | undefined,
) {
  if (type !== 'image' || !image) {
    return null
  }
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new Uint8Array(image.bytes),
  )
  return Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

/** Agents may not save what the owner discarded. */
async function rejectDiscarded(
  db: D1Database,
  origin: ItemOrigin,
  key: SourceKey,
) {
  const entry = origin === 'agent' ? await findDiscard(db, key) : null
  if (entry) {
    throw new DiscardedSourceError(entry)
  }
}

/** The owner adding a source by hand forgets that they discarded it. */
function forgetOnManualSave(
  db: D1Database,
  origin: ItemOrigin,
  key: SourceKey,
) {
  return origin === 'manual' ? [forgetDiscardsStatement(db, key)] : []
}

/**
 * Saves an item, or returns the existing one with merged tags when its source
 * URL or original image is already saved. An agent saving a source the owner
 * discarded gets a DiscardedSourceError; the owner adding it by hand saves it
 * and forgets the discard.
 */
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
  await rejectDiscarded(db, input.origin, { contentHash: null, sourceUrl })
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
  const hash = await originalImageHash(input.type, image)
  await rejectDiscarded(db, input.origin, {
    contentHash: hash,
    sourceUrl: null,
  })
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
    statements.push(
      ...forgetOnManualSave(db, input.origin, { contentHash: hash, sourceUrl }),
    )
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
