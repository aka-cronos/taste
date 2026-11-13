import { z } from 'zod'
import { ITEM_TYPES, normalizeTagName } from '@/lib/items/model'

/** Shared by URL validation and server callers, including MCP tools. */
export const galleryFiltersSchema = z
  .object({
    q: z.string().trim().optional().catch(undefined),
    tags: z
      .union([
        z.string().transform(tag => [tag]),
        z.array(z.string().catch('')),
      ])
      .transform(tags =>
        [...new Set(tags.map(normalizeTagName).filter(Boolean))].sort(),
      )
      .optional()
      .catch(undefined),
    type: z.enum(ITEM_TYPES).optional().catch(undefined),
  })
  .catch({})
  .transform(({ q, tags, type }) => ({
    ...(q ? { q } : {}),
    ...(tags?.length ? { tags } : {}),
    ...(type ? { type } : {}),
  }))

export type GalleryFilters = z.output<typeof galleryFiltersSchema>

export function normalizeGalleryFilters(input: unknown): GalleryFilters {
  return galleryFiltersSchema.parse(input)
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
