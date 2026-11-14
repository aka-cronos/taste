import { z } from 'zod'
import { editItemSchema } from '@/lib/items/edit-input'
import { fetchPublicUrl } from '@/lib/items/fetch-url'
import { ingestItem } from '@/lib/items/ingest'
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from '@/lib/items/input'
import type { StoredImage } from '@/lib/items/link-metadata'
import { getItemEditor, updateItem } from '@/lib/items/manage'
import { getMcpItem } from '@/lib/items/repository'

const MAX_BASE64_LENGTH = 4 * Math.ceil(MAX_IMAGE_BYTES / 3)
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/u
const text = z.string().trim().max(10_000)
const url = editItemSchema.shape.creditUrl.refine(
  Boolean,
  'Provide an HTTP(S) URL.',
)

export const saveItemSchema = z
  .strictObject({
    creditAuthor: editItemSchema.shape.creditAuthor
      .optional()
      .describe('Creator’s name or handle, e.g. "@studio".'),
    creditUrl: editItemSchema.shape.creditUrl
      .optional()
      .describe('Creator’s profile or the original work.'),
    description: z
      .string({ error: 'A description is required.' })
      .trim()
      .min(1, 'A description is required.')
      .max(10_000)
      .describe(
        'Rich visual description: subject, style, palette, medium, composition and why it is worth keeping.',
      ),
    imageBase64: z
      .string()
      .min(1)
      .max(MAX_BASE64_LENGTH)
      .regex(BASE64, 'Provide a valid base64 image.')
      .refine(value => value.length % 4 === 0, 'Provide a valid base64 image.')
      .optional()
      .describe('Raw base64 image bytes, without a data: prefix.'),
    imageContentType: z.enum(IMAGE_TYPES).optional(),
    imageUrl: url
      .optional()
      .describe('Largest available image URL. Taste stores a copy.'),
    note: text
      .optional()
      .describe('The owner’s own note, or the body of a note item.'),
    sourceUrl: url
      .optional()
      .describe(
        'Post or page the reference came from; duplicates are detected by it, so set it on only one image per post and cite the post in creditUrl for the rest. Links and images only; for note citations use creditUrl.',
      ),
    tags: editItemSchema.shape.tags
      .optional()
      .describe('3-8 lowercase tags, reusing existing ones from list_tags.'),
    title: text.optional().describe('Short title; links fetch one if omitted.'),
    type: z.enum(['image', 'link', 'note']),
  })
  .superRefine((input, ctx) => {
    const invalid = (message: string) =>
      ctx.addIssue({ code: 'custom', message })
    if (input.type === 'image') {
      if (Boolean(input.imageUrl) === Boolean(input.imageBase64)) {
        invalid('Provide exactly one of imageUrl or imageBase64 for an image.')
      }
      if (input.imageBase64 && !input.imageContentType) {
        invalid('Provide imageContentType with imageBase64.')
      }
    } else if (input.imageUrl || input.imageBase64 || input.imageContentType) {
      invalid('Image inputs are only supported for image items.')
    }
    if (input.type === 'link' && !input.sourceUrl) {
      invalid('Provide sourceUrl for a link.')
    }
    if (input.type === 'note' && input.sourceUrl) {
      invalid('Notes cannot have sourceUrl. Use creditUrl to cite a source.')
    }
    if (input.type === 'note' && !input.note) {
      invalid('Write a note first.')
    }
  })

export const updateItemSchema = editItemSchema
  .partial()
  .required({ id: true })
  .strict()

export interface McpStorage {
  bucket: Pick<R2Bucket, 'put' | 'delete'>
  db: D1Database
}

export async function saveMcpItem(
  storage: McpStorage,
  input: z.output<typeof saveItemSchema>,
) {
  let image: StoredImage | undefined
  if (input.type === 'image') {
    image = input.imageUrl
      ? await fetchPublicUrl(input.imageUrl, MAX_IMAGE_BYTES)
      : {
          bytes: Uint8Array.from(atob(input.imageBase64 as string), char =>
            char.charCodeAt(0),
          ),
          contentType: input.imageContentType as string,
        }
  }
  const saved = await ingestItem(storage, {
    ...input,
    image,
    origin: 'agent',
    sourceUrl: input.sourceUrl ?? input.imageUrl,
    status: 'inbox',
  })
  return {
    duplicate: saved.duplicate,
    item: await getMcpItem(storage.db, saved.item.id),
  }
}

export async function updateMcpItem(
  db: D1Database,
  input: z.output<typeof updateItemSchema>,
) {
  const current = await getItemEditor(db, input.id)
  if (!current) {
    throw new Error('Item not found.')
  }
  await updateItem(db, editItemSchema.parse({ ...current, ...input }))
  return getMcpItem(db, input.id)
}
