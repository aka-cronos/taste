import {
  creditFor,
  type GalleryItem,
  type GalleryPage,
  type ItemStatus,
  type ItemType,
  mediaUrl,
  safeHttpUrl,
} from '@/lib/items/model'

export const DEFAULT_PAGE_SIZE = 48
const MAX_PAGE_SIZE = 100

interface ItemRow {
  credit_author: string | null
  credit_url: string | null
  description: string
  id: string
  image_height: number | null
  image_key: string | null
  image_width: number | null
  note: string | null
  published_at: number
  source_url: string | null
  /** JSON array of tag names. */
  tags: string
  title: string | null
  type: ItemType
}

// Every public read goes through this filter, so inbox items can only be
// reached by owner-only code paths.
const PUBLISHED_ITEMS = `
  SELECT
    i.id, i.type, i.title, i.description, i.note, i.source_url,
    i.credit_author, i.credit_url, i.image_key, i.image_width,
    i.image_height, i.published_at,
    (
      SELECT json_group_array(t.name)
      FROM item_tags it JOIN tags t ON t.id = it.tag_id
      WHERE it.item_id = i.id
    ) AS tags
  FROM items i
  WHERE i.status = 'published'`

function toGalleryItem(row: ItemRow): GalleryItem {
  const tags = (JSON.parse(row.tags) as string[]).sort((a, b) =>
    a.localeCompare(b),
  )
  return {
    credit: creditFor({
      creditAuthor: row.credit_author,
      creditUrl: row.credit_url,
      sourceUrl: row.source_url,
    }),
    description: row.description,
    id: row.id,
    image: row.image_key
      ? {
          height: row.image_height,
          url: mediaUrl(row.image_key),
          width: row.image_width,
        }
      : null,
    note: row.note,
    publishedAt: row.published_at,
    sourceUrl: safeHttpUrl(row.source_url),
    tags,
    title: row.title,
    type: row.type,
  }
}

function encodeCursor(item: GalleryItem) {
  return `${item.publishedAt}.${item.id}`
}

function decodeCursor(cursor: string) {
  const dot = cursor.indexOf('.')
  const publishedAt = Number(cursor.slice(0, dot))
  const id = cursor.slice(dot + 1)
  if (dot < 1 || !Number.isSafeInteger(publishedAt) || !id) {
    return null
  }
  return { id, publishedAt }
}

/** Published items, newest first, one page at a time. */
export async function listPublishedItems(
  db: D1Database,
  { cursor, limit = DEFAULT_PAGE_SIZE }: { cursor?: string; limit?: number },
): Promise<GalleryPage> {
  const size = Math.min(Math.max(1, Math.trunc(limit)), MAX_PAGE_SIZE)
  const after = cursor ? decodeCursor(cursor) : null
  const statement = after
    ? db
        .prepare(
          `${PUBLISHED_ITEMS}
            AND (i.published_at < ?1 OR (i.published_at = ?1 AND i.id < ?2))
          ORDER BY i.published_at DESC, i.id DESC LIMIT ?3`,
        )
        .bind(after.publishedAt, after.id, size + 1)
    : db
        .prepare(
          `${PUBLISHED_ITEMS} ORDER BY i.published_at DESC, i.id DESC LIMIT ?1`,
        )
        .bind(size + 1)
  const { results } = await statement.all<ItemRow>()
  const items = results.slice(0, size).map(toGalleryItem)
  const last = items.at(-1)
  return {
    items,
    nextCursor: results.length > size && last ? encodeCursor(last) : null,
  }
}

/** A published item, or null when it does not exist or is in the inbox. */
export async function getPublishedItem(
  db: D1Database,
  id: string,
): Promise<GalleryItem | null> {
  const row = await db
    .prepare(`${PUBLISHED_ITEMS} AND i.id = ?1`)
    .bind(id)
    .first<ItemRow>()
  return row ? toGalleryItem(row) : null
}

/** Status of the item that owns an R2 key, or null when no item does. */
export async function getMediaStatus(
  db: D1Database,
  key: string,
): Promise<ItemStatus | null> {
  return await db
    .prepare('SELECT status FROM items WHERE image_key = ?1')
    .bind(key)
    .first<ItemStatus>('status')
}
