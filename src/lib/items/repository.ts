import {
  creditFor,
  type GalleryItem,
  type GalleryPage,
  type ItemStatus,
  type ItemType,
  mediaUrl,
  safeHttpUrl,
} from '@/lib/items/model'
import {
  type GalleryFilters,
  gallerySearchConditions,
} from '@/lib/items/search'

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

const ITEM_SELECT = `
  SELECT
    i.id, i.type, i.title, i.description, i.note, i.source_url,
    i.credit_author, i.credit_url, i.image_key, i.image_width,
    i.image_height, coalesce(i.published_at, i.created_at) AS published_at,
    (
      SELECT json_group_array(t.name)
      FROM item_tags it JOIN tags t ON t.id = it.tag_id
      WHERE it.item_id = i.id
    ) AS tags
  FROM items i
  WHERE 1 = 1`

// Every public read goes through this filter, so inbox items can only be
// reached by owner-only code paths.
const PUBLISHED_ITEMS = `${ITEM_SELECT} AND i.status = 'published'`

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
  {
    cursor,
    limit = DEFAULT_PAGE_SIZE,
    ...filters
  }: GalleryFilters & { cursor?: string; limit?: number },
): Promise<GalleryPage> {
  const size = Number.isFinite(limit)
    ? Math.min(Math.max(1, Math.trunc(limit)), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE
  const after = cursor ? decodeCursor(cursor) : null
  const { clauses, values } = gallerySearchConditions(filters)
  const params: (string | number)[] = [...values]
  if (after) {
    clauses.push('(i.published_at < ? OR (i.published_at = ? AND i.id < ?))')
    params.push(after.publishedAt, after.publishedAt, after.id)
  }
  params.push(size + 1)
  const statement = db
    .prepare(
      `${PUBLISHED_ITEMS}${clauses.map(clause => ` AND ${clause}`).join('')}
     ORDER BY i.published_at DESC, i.id DESC LIMIT ?`,
    )
    .bind(...params)
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

/** Tags attached to public items only; inbox-only tags stay private. */
export async function listPublishedTags(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare(`
    SELECT DISTINCT t.normalized_name AS name
    FROM tags t JOIN item_tags it ON it.tag_id = t.id
    JOIN items i ON i.id = it.item_id
    WHERE i.status = 'published'
    ORDER BY t.normalized_name
  `)
    .all<{ name: string }>()
  return results.map(tag => tag.name)
}

/** Owner-only callers can also open inbox items. */
export async function getOwnerGalleryItem(db: D1Database, id: string) {
  const row = await db
    .prepare(`${ITEM_SELECT} AND i.id = ?1`)
    .bind(id)
    .first<ItemRow>()
  return row ? toGalleryItem(row) : null
}
