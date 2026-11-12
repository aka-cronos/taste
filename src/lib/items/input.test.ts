import { expect, it } from 'vitest'
import {
  IMAGE_ERROR,
  itemFieldErrors,
  itemInputSchema,
  parseManualItem,
} from '@/lib/items/input'

const base = { note: 'A note', origin: 'agent', status: 'inbox', type: 'note' }
it.each([
  [
    { description: 'x'.repeat(10_001) },
    'description',
    'Item text must be at most 10,000 characters.',
  ],
  [
    { tags: Array.from({ length: 51 }, () => 'tag') },
    'tags',
    'Use up to 50 tags, each at most 100 characters.',
  ],
  [
    { tags: ['x'.repeat(101)] },
    'tags',
    'Use up to 50 tags, each at most 100 characters.',
  ],
  [{ note: '   ' }, 'note', 'Write a note first.'],
  [{ sourceUrl: '', type: 'link' }, 'sourceUrl', 'Paste a URL first.'],
  [
    { sourceUrl: 'javascript:alert(1)', type: 'link' },
    'sourceUrl',
    'Invalid URL.',
  ],
  [{ type: 'image' }, 'image', 'Choose an image first.'],
  [
    {
      image: new File(['text'], 'text.txt', { type: 'text/plain' }),
      type: 'image',
    },
    'image',
    IMAGE_ERROR,
  ],
] as const)(
  'validates domain input and retains the field path (%s)',
  (input, field, message) => {
    const result = itemInputSchema.safeParse({ ...base, ...input })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(message)
      expect(result.error.issues[0]?.path[0]).toBe(field)
    }
  },
)
it('parses multipart input using the same schema and returns field errors', () => {
  const form = new FormData()
  form.set('type', 'note')
  form.set('note', '   ')
  const invalid = parseManualItem(form)
  expect(invalid.success).toBe(false)
  if (!invalid.success) {
    expect(itemFieldErrors(invalid.error)).toEqual({
      note: 'Write a note first.',
    })
  }
  form.set('note', 'A reference')
  form.set('tags', ' Warm, Type, ,')
  expect(parseManualItem(form)).toMatchObject({
    data: {
      note: 'A reference',
      origin: 'manual',
      status: 'published',
      tags: ['Warm', 'Type'],
    },
    success: true,
  })
})
it('rejects a file sent in place of a text field', () => {
  const form = new FormData()
  form.set('type', 'note')
  form.set('note', new File(['text'], 'text.txt'))
  expect(parseManualItem(form).success).toBe(false)
})
