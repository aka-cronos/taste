import { ITEM_TYPES, type ItemType, normalizeTagName } from '@/lib/items/model'

export interface GalleryFilters {
  q?: string
  tags?: string[]
  type?: ItemType
}

/** Shared by URL validation and server callers, including MCP tools. */
export function normalizeGalleryFilters(input: unknown): GalleryFilters {
  const value = (input && typeof input === 'object' ? input : {}) as Record<
    string,
    unknown
  >
  const q = typeof value.q === 'string' ? value.q.trim() : ''
  const rawTags = Array.isArray(value.tags) ? value.tags : [value.tags]
  const tags = [
    ...new Set(
      rawTags
        .filter((tag): tag is string => typeof tag === 'string')
        .map(normalizeTagName)
        .filter(Boolean),
    ),
  ].sort()
  const type = ITEM_TYPES.find(itemType => itemType === value.type)
  return {
    ...(q ? { q } : {}),
    ...(tags.length ? { tags } : {}),
    ...(type ? { type } : {}),
  }
}

/** Bound predicates for the published-items query (whose item alias is `i`). */
export function gallerySearchConditions(input: GalleryFilters) {
  const { q, tags, type } = normalizeGalleryFilters(input)
  const clauses: string[] = []
  const values: string[] = []
  if (q) {
    // Treat input as words, never as FTS operators or column selectors.
    const words = q.match(/[\p{L}\p{N}\p{M}]+/gu) ?? []
    if (words.length) {
      clauses.push(
        'i.id IN (SELECT item_id FROM items_fts WHERE items_fts MATCH ?)',
      )
      values.push(words.map(word => `"${word}"`).join(' AND '))
    } else {
      clauses.push('0')
    }
  }
  for (const tag of tags ?? []) {
    clauses.push(`EXISTS (
      SELECT 1 FROM item_tags it JOIN tags t ON t.id = it.tag_id
      WHERE it.item_id = i.id AND t.normalized_name = ?
    )`)
    values.push(tag)
  }
  if (type) {
    clauses.push('i.type = ?')
    values.push(type)
  }
  return { clauses, values }
}
