import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { getPublishedItem, listPublishedItems } from '@/lib/items/repository'

/** A page of the public gallery: published items only. */
export const listGallery = createServerFn({ method: 'GET' })
  .validator((input: { cursor?: string } | undefined) => ({
    cursor: typeof input?.cursor === 'string' ? input.cursor : undefined,
  }))
  .handler(({ data }) => listPublishedItems(env.DB, data))

/** One published item, or null when it does not exist or is in the inbox. */
export const getGalleryItem = createServerFn({ method: 'GET' })
  .validator((input: { id: string }) => {
    // The input comes from the client; check it despite its declared type.
    const { id } = input as { id?: unknown }
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('Expected an item id.')
    }
    return { id }
  })
  .handler(({ data }) => getPublishedItem(env.DB, data.id))
