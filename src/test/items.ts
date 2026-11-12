import type { DatabaseSync } from 'node:sqlite'
import type { ItemOrigin, ItemStatus, ItemType } from '@/lib/items/model'
import { normalizeTagName } from '@/lib/items/model'

export interface ItemFixture {
  contentHash?: string | null
  createdAt?: number
  creditAuthor?: string | null
  creditUrl?: string | null
  description?: string
  id: string
  imageHeight?: number | null
  imageKey?: string | null
  imageWidth?: number | null
  note?: string | null
  origin?: ItemOrigin
  publishedAt?: number | null
  sourceUrl?: string | null
  status?: ItemStatus
  tags?: string[]
  title?: string | null
  type?: ItemType
}

/** Inserts an item and its tags straight into the database. */
export function insertItem(sqlite: DatabaseSync, item: ItemFixture) {
  const status = item.status ?? 'published'
  const createdAt = item.createdAt ?? 1_700_000_000_000
  const type = item.type ?? 'note'
  const defaultPublishedAt = status === 'published' ? createdAt : null
  sqlite
    .prepare(
      `INSERT INTO items (
        id, type, title, description, note, source_url, credit_author,
        credit_url, origin, status, content_hash, image_key, image_width,
        image_height, created_at, updated_at, published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      item.id,
      type,
      item.title ?? null,
      item.description ?? '',
      item.note ?? null,
      item.sourceUrl ?? null,
      item.creditAuthor ?? null,
      item.creditUrl ?? null,
      item.origin ?? 'manual',
      status,
      item.contentHash ?? null,
      item.imageKey ?? (type === 'image' ? `items/${item.id}.png` : null),
      item.imageWidth ?? null,
      item.imageHeight ?? null,
      createdAt,
      createdAt,
      item.publishedAt === undefined ? defaultPublishedAt : item.publishedAt,
    )
  for (const name of item.tags ?? []) {
    tagItem(sqlite, item.id, name)
  }
}

export function tagItem(sqlite: DatabaseSync, itemId: string, name: string) {
  sqlite
    .prepare(
      'INSERT INTO tags (name, normalized_name) VALUES (?, ?) ON CONFLICT DO NOTHING',
    )
    .run(name, normalizeTagName(name))
  sqlite
    .prepare(
      `INSERT INTO item_tags (item_id, tag_id)
       SELECT ?, id FROM tags WHERE normalized_name = ?`,
    )
    .run(itemId, normalizeTagName(name))
}
