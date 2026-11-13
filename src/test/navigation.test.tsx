// biome-ignore-all lint/performance/noAwaitInLoops: sequential interactions measure cache reuse within each session
import { writeFileSync } from 'node:fs'

import {
  createMemoryHistory,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createQueryClient } from '@/lib/query-client'
import { Route as root } from '@/routes/__root'
import { Route as inbox } from '@/routes/inbox'
import { Route as gallery } from '@/routes/index'
import { Route as item } from '@/routes/items/$id'

const routeTree = root.addChildren([
  createRoute({ ...gallery.options, getParentRoute: () => root, path: '/' }),
  createRoute({
    ...item.options,
    getParentRoute: () => root,
    path: '/items/$id',
  }),
  createRoute({ ...inbox.options, getParentRoute: () => root, path: '/inbox' }),
])

vi.mock('@/lib/bootstrap', () => ({
  getBootstrap: () =>
    request('bootstrap', {
      contactUrl: null,
      inboxCount: state.owner ? 1 : 0,
      owner: state.owner
        ? { email: 'owner@example.com', image: null, name: 'Owner' }
        : null,
    }),
}))
const state = vi.hoisted(() => ({ calls: [] as string[], owner: false }))
vi.mock('@/lib/auth/session', () => ({
  getOwner: async () => {
    state.calls.push('owner')
    await new Promise(resolve => setTimeout(resolve, 10))
    return state.owner
      ? { email: 'owner@example.com', image: null, name: 'Owner' }
      : null
  },
}))
vi.mock('@/lib/site-config', () => ({
  getContactUrl: async () => {
    state.calls.push('contact')
    await new Promise(resolve => setTimeout(resolve, 10))
    return null
  },
}))
vi.mock('@/lib/items/add', () => ({ addManualItem: vi.fn() }))
vi.mock('@/lib/request-origin', () => ({
  getRequestOrigin: () => 'https://taste.example',
}))
const note = {
  credit: null,
  description: 'Alpha',
  id: 'a',
  image: null,
  note: 'Alpha',
  publishedAt: 1,
  sourceUrl: null,
  tags: [],
  title: 'Alpha',
  type: 'note',
}
async function request(name: string, result: unknown) {
  state.calls.push(name)
  await new Promise(resolve => setTimeout(resolve, 10))
  return result
}
vi.mock('@/lib/items/server', () => ({
  getGalleryItem: () => request('item', note),
  listGallery: () => request('gallery', { items: [note], nextCursor: null }),
  listGalleryTags: () => request('tags', []),
}))
vi.mock('@/lib/items/manage-server', () => ({
  changeItemVisibility: vi.fn(),
  getOwnerItem: () =>
    request('ownerItem', {
      editor: {
        creditAuthor: '',
        creditUrl: '',
        description: 'Alpha',
        id: 'a',
        note: 'Alpha',
        status: 'published',
        tags: [],
        title: 'Alpha',
      },
      item: note,
      tags: [],
    }),
  permanentlyDeleteItem: vi.fn(),
  saveItemEdits: vi.fn(),
}))
vi.mock('@/lib/items/inbox-server', () => ({
  deleteInbox: vi.fn(),
  discardInbox: vi.fn(),
  forgetDiscarded: vi.fn(),
  getDiscarded: () => request('discarded', { count: 0, entries: [] }),
  getInbox: () => request('inbox', { count: 1, items: [] }),
  getInboxCount: () => request('count', 1),
  publishInbox: vi.fn(),
}))
window.scrollTo = () => undefined
afterEach(cleanup)

it.skipIf(!process.env.NAV_BENCH)(
  'records navigation requests and interaction-to-content in a controlled environment',
  async () => {
    const results: unknown[] = []
    for (const owner of [false, true]) {
      state.owner = owner
      for (let repeat = 0; repeat < 3; repeat += 1) {
        const queryClient = createQueryClient()
        const router = createRouter({
          context: { queryClient },
          defaultPreload: 'intent',
          history: createMemoryHistory({ initialEntries: ['/'] }),
          routeTree,
        })
        setupRouterSsrQueryIntegration({ queryClient, router })
        const measure = async (
          name: string,
          action: () => Promise<unknown>,
          content?: () => unknown,
        ) => {
          state.calls = []
          const start = performance.now()
          await act(action)
          if (content) {
            await waitFor(content)
          }
          results.push({
            calls: [...state.calls],
            ms: Math.round(performance.now() - start),
            name,
            owner,
            repeat,
          })
        }
        await measure('cold gallery', () => router.load())
        const view = render(<RouterProvider router={router} />)
        await measure('filter B', () =>
          router.navigate({ search: { q: 'B' }, to: '/' }),
        )
        await measure('filter A', () =>
          router.navigate({ search: {}, to: '/' }),
        )
        await measure(
          'drawer',
          () => router.navigate({ search: { item: 'a' }, to: '/' }),
          () =>
            expect(screen.getByRole('dialog', { name: 'Alpha' })).toBeTruthy(),
        )
        await measure('close', () => router.navigate({ search: {}, to: '/' }))
        await measure(
          'reopen',
          () => router.navigate({ search: { item: 'a' }, to: '/' }),
          () =>
            expect(screen.getByRole('dialog', { name: 'Alpha' })).toBeTruthy(),
        )
        await measure('direct item', () =>
          router.navigate({ params: { id: 'a' }, to: '/items/$id' }),
        )
        await measure('warm gallery', () =>
          router.navigate({ search: {}, to: '/' }),
        )
        await measure('intent preload', () =>
          router.preloadRoute({ search: { item: 'b' }, to: '/' }),
        )
        await measure('after intent', () =>
          router.navigate({ search: { item: 'b' }, to: '/' }),
        )
        await measure('inbox', () => router.navigate({ to: '/inbox' }))
        view.unmount()
        const directClient = createQueryClient()
        const directRouter = createRouter({
          context: { queryClient: directClient },
          history: createMemoryHistory({ initialEntries: ['/items/a'] }),
          routeTree,
        })
        setupRouterSsrQueryIntegration({
          queryClient: directClient,
          router: directRouter,
        })
        await measure('cold direct item', () => directRouter.load())
        directClient.clear()
        queryClient.clear()
      }
    }
    if (process.env.BENCH_OUTPUT) {
      writeFileSync(process.env.BENCH_OUTPUT, JSON.stringify(results, null, 2))
    }
  },
)
