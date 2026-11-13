import { QueryCache, QueryClient } from '@tanstack/react-query'
import type { Owner } from '@/lib/auth/owner'

export const navigationStaleTime = 30_000
export const bootstrapKey = ['bootstrap'] as const

export function clearOwnerQueries(client: QueryClient) {
  const filters = {
    predicate: (query: { queryKey: readonly unknown[] }) =>
      query.queryKey[0] === 'owner',
  }
  // Cancellation prevents an already-running request from repopulating the cache.
  client.cancelQueries(filters)
  client.removeQueries(filters)
}

export function resetSession(client: QueryClient) {
  client.cancelQueries({ queryKey: bootstrapKey })
  clearOwnerQueries(client)
  client.setQueryData(
    bootstrapKey,
    (previous: { contactUrl: string | null } | undefined) => ({
      contactUrl: previous?.contactUrl ?? null,
      inboxCount: 0,
      owner: null,
    }),
  )
}

export function createQueryClient(onSessionChange?: () => void) {
  let client: QueryClient
  let previousOwner: string | null | undefined
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: navigationStaleTime },
    },
    queryCache: new QueryCache({
      onError: error => {
        if ('status' in error && error.status === 401) {
          resetSession(client)
          onSessionChange?.()
        }
      },
      onSuccess: (data, query) => {
        if (query.queryKey[0] !== 'bootstrap') {
          return
        }
        const owner = (data as { owner: Owner | null }).owner?.email ?? null
        const hasOtherOwner = client
          .getQueryCache()
          .findAll()
          .some(
            entry =>
              entry.queryKey[0] === 'owner' && entry.queryKey[1] !== owner,
          )
        if (
          hasOtherOwner ||
          (previousOwner !== undefined && previousOwner !== owner)
        ) {
          clearOwnerQueries(client)
          onSessionChange?.()
        }
        previousOwner = owner
      },
    }),
  })
  return client
}
