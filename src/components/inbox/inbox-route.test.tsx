import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Owner } from '@/lib/auth/owner'
import { getInbox } from '@/lib/items/inbox-server'
import { Route } from '@/routes/inbox'

vi.mock('@/lib/items/inbox-server', () => ({
  discardInbox: vi.fn(),
  getInbox: vi.fn(),
  publishInbox: vi.fn(),
}))
window.scrollTo = () => undefined

const owner = { email: 'owner@example.com', image: null, name: 'Owner' }

afterEach(cleanup)
beforeEach(() => {
  vi.mocked(getInbox).mockReset()
  vi.mocked(getInbox).mockResolvedValue({
    count: 1,
    items: [
      {
        credit: null,
        description: 'From an agent',
        id: 'saved',
        image: null,
        note: null,
        origin: 'agent',
        publishedAt: 1,
        sourceUrl: null,
        tags: [],
        title: 'Saved by Grok',
        type: 'note',
      },
    ],
  })
})

async function openInbox(signedIn: Owner | null) {
  const root = createRootRoute({
    beforeLoad: (): Promise<{
      contactUrl: string | null
      inboxCount: number
      owner: Owner | null
    }> => Promise.resolve({ contactUrl: null, inboxCount: 1, owner: signedIn }),
  })
  const routeTree = root.addChildren([
    createRoute({ getParentRoute: () => root, path: '/' }),
    createRoute({ getParentRoute: () => root, path: '/items/$id' }),
    createRoute({
      ...Route.options,
      getParentRoute: () => root,
      path: '/inbox',
    }),
  ])
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ['/inbox'] }),
    routeTree,
  })
  await act(() => router.load())
  render(<RouterProvider router={router as never} />)
}

it('shows the inbox to the owner', async () => {
  await openInbox(owner)
  expect(screen.getByRole('heading', { name: 'Inbox' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Saved by Grok' })).toBeTruthy()
})

it('hides the inbox from visitors without asking the server', async () => {
  await openInbox(null)
  expect(screen.getByRole('heading', { name: 'Page not found' })).toBeTruthy()
  expect(screen.queryByText('Saved by Grok')).toBeNull()
  expect(getInbox).not.toHaveBeenCalled()
})
