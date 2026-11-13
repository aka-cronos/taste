import { z } from 'zod'
import { normalizeTagName, safeHttpUrl } from '@/lib/items/model'

const text = z.string().trim().max(10_000)
export const itemIdSchema = z.object({ id: z.string().min(1).max(200) })
export const editItemSchema = itemIdSchema.extend({
  creditAuthor: text,
  creditUrl: text.refine(
    value => !value || Boolean(safeHttpUrl(value)),
    'Use an http(s) credit URL.',
  ),
  description: text,
  note: text,
  tags: z
    .array(z.string().max(100))
    .max(50)
    .transform(tags => [
      ...new Set(tags.map(normalizeTagName).filter(Boolean)),
    ]),
  title: text,
})
export const visibilitySchema = itemIdSchema.extend({
  status: z.enum(['inbox', 'published']),
})
export type EditItemInput = z.infer<typeof editItemSchema>
export interface ItemEditorData extends EditItemInput {
  status: 'inbox' | 'published'
}

/** Inbox items to publish or discard at once. */
export const inboxSelectionSchema = z.object({
  ids: z
    .array(itemIdSchema.shape.id)
    .min(1)
    .max(100)
    .transform(ids => [...new Set(ids)]),
})
export type InboxSelection = z.infer<typeof inboxSelectionSchema>

/** A discard entry to forget. */
export const discardIdSchema = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
})
