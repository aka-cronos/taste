import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { act, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { bootstrapKey, createQueryClient } from '@/lib/query-client'

// jsdom has no scrolling; the router scrolls to the top on every load.
window.scrollTo = () => undefined

/**
 * Renders UI that uses router links, inside a minimal router with the routes
 * those links point at.
 */
export async function renderWithRouter(ui: ReactNode) {
  const queryClient = createQueryClient()
  queryClient.setQueryData(bootstrapKey, {
    contactUrl: null,
    inboxCount: 0,
    owner: null,
  })
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({
      component: () => ui,
      getParentRoute: () => rootRoute,
      path: '/',
    }),
    createRoute({ getParentRoute: () => rootRoute, path: '/items/$id' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/inbox' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/inbox/discarded' }),
  ])
  const router = createRouter({
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: ['/'] }),
    routeTree,
  })
  setupRouterSsrQueryIntegration({ queryClient, router })
  await act(() => router.load())
  return render(<RouterProvider router={router as never} />)
}
