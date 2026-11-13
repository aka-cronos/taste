import {
  CancelledError,
  infiniteQueryOptions,
  type QueryClient,
  queryOptions,
} from '@tanstack/react-query'
import { getBootstrap } from '@/lib/bootstrap'
import type { GalleryPage } from '@/lib/items/model'
import { normalizeGalleryFilters } from '@/lib/items/search'
import { bootstrapKey } from '@/lib/query-client'

async function ownerRequest<T>(
  client: QueryClient,
  email: string,
  request: () => Promise<T>,
): Promise<T> {
  const check = () => {
    const bootstrap = client.getQueryData<{ owner: { email: string } | null }>(
      bootstrapKey,
    )
    if (bootstrap?.owner?.email !== email) {
      throw new CancelledError({ silent: true })
    }
  }
  check()
  const result = await request()
  check()
  return result
}

export const bootstrapQuery = () =>
  queryOptions({
    queryFn: ({ signal }) => getBootstrap({ signal }),
    queryKey: bootstrapKey,
  })

export const galleryQuery = (input: unknown) => {
  const filters = normalizeGalleryFilters(input)
  return infiniteQueryOptions({
    getNextPageParam: (page: GalleryPage) => page.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      (await import('@/lib/items/server')).listGallery({
        data: { ...filters, ...(pageParam ? { cursor: pageParam } : {}) },
        signal,
      }),
    queryKey: ['public', 'gallery', filters] as const,
  })
}
export const tagsQuery = () =>
  queryOptions({
    queryFn: async ({ signal }) =>
      (await import('@/lib/items/server')).listGalleryTags({ signal }),
    queryKey: ['public', 'tags'],
  })
export const itemQuery = (id: string, email: string | undefined) =>
  queryOptions({
    queryFn: ({ signal, client }) => {
      const request = async () =>
        (await import('@/lib/items/item-view')).loadItemView(
          id,
          Boolean(email),
          signal,
        )
      return email ? ownerRequest(client, email, request) : request()
    },
    queryKey: email ? ['owner', email, 'item', id] : ['public', 'item', id],
  })
export const inboxQuery = (email: string) =>
  queryOptions({
    queryFn: ({ signal, client }) =>
      ownerRequest(client, email, async () =>
        (await import('@/lib/items/inbox-server')).getInbox({ signal }),
      ),
    queryKey: ['owner', email, 'inbox'],
  })
export const discardedQuery = (email: string) =>
  queryOptions({
    queryFn: ({ signal, client }) =>
      ownerRequest(client, email, async () =>
        (await import('@/lib/items/inbox-server')).getDiscarded({ signal }),
      ),
    queryKey: ['owner', email, 'discarded'],
  })
