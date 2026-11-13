import type { QueryClient } from '@tanstack/react-query'
import type { AnyRouter } from '@tanstack/react-router'
import { resetSession } from '@/lib/query-client'

export async function refreshQueries(router: AnyRouter) {
  const client = router.options.context?.queryClient as QueryClient
  await client.cancelQueries()
  await client.invalidateQueries()
  await router.invalidate()
}

export function handleSessionError(router: AnyRouter, error: unknown) {
  if (error instanceof Error && 'status' in error && error.status === 401) {
    resetSession(router.options.context?.queryClient as QueryClient)
    router.clearCache()
    router.invalidate()
  }
}
