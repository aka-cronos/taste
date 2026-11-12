import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { requireOwner } from '@/lib/auth/session'
import { MAX_IMAGE_BYTES } from '@/lib/items/fetch-url'
import { ingestItem } from '@/lib/items/ingest'
import { ITEM_TYPES, type ItemType } from '@/lib/items/model'

export const addManualItem = createServerFn({ method: 'POST' })
  .middleware([requireOwner])
  .validator((input: FormData) => {
    if (!(input instanceof FormData)) {
      throw new Error('Expected an item form.')
    }
    return input
  })
  .handler(async ({ data }) => {
    const text = (key: string) => {
      const value = data.get(key)
      if (value !== null && typeof value !== 'string') {
        throw new Error('Invalid form field.')
      }
      return value ?? undefined
    }
    const type = text('type') as ItemType
    if (!ITEM_TYPES.includes(type)) {
      throw new Error('Choose an item type.')
    }
    const file = data.get('image')
    if (file && (!(file instanceof File) || file.size > MAX_IMAGE_BYTES)) {
      throw new Error('Choose an image up to 10 MB.')
    }
    return ingestItem(
      { bucket: env.BUCKET, db: env.DB },
      {
        description: text('description'),
        image:
          file instanceof File && file.size
            ? {
                bytes: new Uint8Array(await file.arrayBuffer()),
                contentType: file.type,
              }
            : undefined,
        note: text('note'),
        origin: 'manual',
        sourceUrl: text('sourceUrl'),
        status: 'published',
        tags: (text('tags') ?? '')
          .split(',')
          .map(tag => tag.trim())
          .filter(Boolean),
        type,
      },
    )
  })
