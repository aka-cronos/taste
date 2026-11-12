import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { requireOwner } from '@/lib/auth/session'
import { ingestItem } from '@/lib/items/ingest'
import { itemFieldErrors, parseManualItem } from '@/lib/items/input'

export const addManualItem = createServerFn({ method: 'POST' })
  .middleware([requireOwner])
  .validator((input: FormData) => {
    if (!(input instanceof FormData)) {
      throw new Error('Expected an item form.')
    }
    const parsed = parseManualItem(input)
    return parsed.success
      ? { fieldErrors: null, input: parsed.data }
      : { fieldErrors: itemFieldErrors(parsed.error), input: null }
  })
  .handler(async ({ data }) => {
    if (data.fieldErrors) {
      return { fieldErrors: data.fieldErrors }
    }
    const { image, ...input } = data.input
    return ingestItem(
      { bucket: env.BUCKET, db: env.DB },
      {
        ...input,
        image: image
          ? {
              bytes: new Uint8Array(await image.arrayBuffer()),
              contentType: image.type,
            }
          : undefined,
      },
    )
  })
