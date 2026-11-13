import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Owner } from '@/lib/auth/owner'
import { getDiscarded, getInbox } from '@/lib/items/inbox-server'
import { Route } from '@/routes/inbox'
import { Route as DiscardedRoute } from '@/routes/inbox_.discarded'

vi.mock('@/lib/items/inbox-server', () => ({
  deleteInbox: vi.fn(),
  discardInbox: vi.fn(),
  forgetDiscarded: vi.fn(),
  getDiscarded: vi.fn(),
  getInbox: vi.fn(),
  publishInbox: vi.fn(),
}))
window.scrollTo = () => undefined

const owner = { email: 'owner@example.com', image: null, name: 'Owner' }

afterEach(cleanup)
beforeEach(() => {
  vi.mocked(getInbox).mockReset()
  vi.mocked(getDiscarded).mockReset()
  vi.mocked(getDiscarded).mockResolvedValue([
    {
      discardedAt: 1,
      id: 1,
      sourceHost: 'example.com',
      sourceUrl: 'https://example.com/post',
      title: 'Discarded post',
    },
  ])
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

async function openInbox(signedIn: Owner | null, path = '/inbox') {
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
    createRoute({
      ...DiscardedRoute.options,
      getParentRoute: () => root,
      path: '/inbox/discarded',
    }),
  ])
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
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

it('shows what was discarded to the owner', async () => {
  await openInbox(owner, '/inbox/discarded')
  expect(screen.getByRole('heading', { name: 'Discarded' })).toBeTruthy()
  expect(screen.getByText('Discarded post')).toBeTruthy()
})

it('hides what was discarded from visitors without asking the server', async () => {
  await openInbox(null, '/inbox/discarded')
  expect(screen.getByRole('heading', { name: 'Page not found' })).toBeTruthy()
  expect(screen.queryByText('Discarded post')).toBeNull()
  expect(getDiscarded).not.toHaveBeenCalled()
})

/**
 * The header's element tree and classes, without its text. Tab links are left
 * out because their look follows which one is active.
 */
function headerShape(element: Element): string {
  const children =
    element.tagName === 'NAV' ? [] : Array.from(element.children, headerShape)
  return `${element.tagName}.${element.className}(${children.join(',')})`
}

function activeTab() {
  return within(screen.getByRole('navigation', { name: 'Inbox views' }))
    .getAllByRole('link')
    .find(link => link.getAttribute('aria-current') === 'page')?.textContent
}

it('renders both tabs through the same header', async () => {
  await openInbox(owner)
  const inbox = headerShape(screen.getByRole('banner'))
  expect(activeTab()).toBe('Inbox')
  cleanup()
  await openInbox(owner, '/inbox/discarded')
  expect(headerShape(screen.getByRole('banner'))).toBe(inbox)
  expect(activeTab()).toBe('Discarded')
})
