import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { act, render } from '@testing-library/react'
import type { ReactNode } from 'react'

// jsdom has no scrolling; the router scrolls to the top on every load.
window.scrollTo = () => undefined

/**
 * Renders UI that uses router links, inside a minimal router with the routes
 * those links point at.
 */
export async function renderWithRouter(ui: ReactNode) {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({
      component: () => ui,
      getParentRoute: () => rootRoute,
      path: '/',
    }),
    createRoute({ getParentRoute: () => rootRoute, path: '/items/$id' }),
  ])
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ['/'] }),
    routeTree,
  })
  await act(() => router.load())
  return render(<RouterProvider router={router as never} />)
}
