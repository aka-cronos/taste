import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { createQueryClient } from '@/lib/query-client'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const queryClient = createQueryClient(() => {
    router.clearCache()
    router.invalidate()
  })
  const router = createRouter({
    context: { queryClient },
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    routeTree,
    scrollRestoration: true,
  })
  setupRouterSsrQueryIntegration({ queryClient, router })
  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
