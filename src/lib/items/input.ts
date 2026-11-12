import { z } from 'zod'
import { safeHttpUrl } from '@/lib/items/model'

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]
export const IMAGE_ERROR = 'Choose a PNG, JPEG, GIF or WebP image up to 10 MB.'
const TEXT_ERROR = 'Item text must be at most 10,000 characters.'
const TAG_ERROR = 'Use up to 50 tags, each at most 100 characters.'
const text = z.string({ error: TEXT_ERROR }).max(10_000, TEXT_ERROR).optional()
export const imageSchema = z
  .file({ error: 'Choose an image first.' })
  .max(MAX_IMAGE_BYTES, IMAGE_ERROR)
  .mime(IMAGE_TYPES, IMAGE_ERROR)
const fields = {
  description: text,
  image: imageSchema.optional(),
  note: text,
  origin: z.enum(['manual', 'agent'], {
    error: 'Invalid item type, origin or status.',
  }),
  sourceUrl: text,
  status: z.enum(['published', 'inbox'], {
    error: 'Invalid item type, origin or status.',
  }),
  tags: z
    .array(z.string({ error: TAG_ERROR }).max(100, TAG_ERROR), {
      error: TAG_ERROR,
    })
    .max(50, TAG_ERROR)
    .optional(),
  title: text,
}
export const itemInputSchema = z.discriminatedUnion(
  'type',
  [
    z.object({
      ...fields,
      sourceUrl: text
        .refine(value => Boolean(value), 'Paste a URL first.')
        .refine(value => !value || Boolean(safeHttpUrl(value)), 'Invalid URL.'),
      type: z.literal('link'),
    }),
    z.object({
      ...fields,
      image: imageSchema,
      type: z.literal('image'),
    }),
    z.object({
      ...fields,
      note: text.refine(value => Boolean(value?.trim()), 'Write a note first.'),
      type: z.literal('note'),
    }),
  ],
  { error: 'Invalid item type, origin or status.' },
)
export type ItemInput = z.output<typeof itemInputSchema>
export const itemFormSchema = z
  .object({
    description: z.string(),
    image: z.file().optional(),
    note: z.string(),
    sourceUrl: z.string(),
    tags: z.string().transform(value =>
      value
        .split(',')
        .map(tag => tag.trim())
        .filter(Boolean),
    ),
    type: z.enum(['link', 'image', 'note']),
  })
  .transform((value, context) => {
    const parsed = itemInputSchema.safeParse({
      ...value,
      origin: 'manual',
      status: 'published',
    })
    if (!parsed.success) {
      context.issues.push(
        ...parsed.error.issues.map(issue => ({
          code: 'custom' as const,
          input: value,
          message: issue.message,
          path: issue.path,
        })),
      )
      return z.NEVER
    }
    return parsed.data
  })
export type ItemFormValues = z.input<typeof itemFormSchema>
export type ItemFieldErrors = Partial<Record<keyof ItemFormValues, string>>
export function itemFieldErrors(error: z.ZodError): ItemFieldErrors {
  const errors: ItemFieldErrors = {}
  for (const issue of error.issues) {
    const field = issue.path[0] as keyof ItemFormValues
    errors[field] ??= issue.message
  }
  return errors
}

export function parseManualItem(input: FormData) {
  return itemFormSchema.safeParse({
    description: input.get('description') ?? '',
    image: input.get('image') ?? undefined,
    note: input.get('note') ?? '',
    sourceUrl: input.get('sourceUrl') ?? '',
    tags: input.get('tags') ?? '',
    type: input.get('type'),
  })
}
