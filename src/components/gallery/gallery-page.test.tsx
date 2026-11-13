import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NOT_AUTHORIZED_MESSAGE, type Owner } from '@/lib/auth/owner'
import { listGallery, listGalleryTags } from '@/lib/items/server'
import { Route as RootRoute } from '@/routes/__root'
import { Route } from '@/routes/index'

vi.mock('@/lib/items/add', () => ({ addManualItem: vi.fn() }))

vi.mock('@/lib/items/server', () => ({
  listGallery: vi.fn(),
  listGalleryTags: vi.fn(),
}))
vi.mock('@/lib/auth/session', () => ({ getOwner: vi.fn() }))
vi.mock('@/lib/site-config', () => ({ getContactUrl: vi.fn() }))
window.scrollTo = () => undefined

afterEach(cleanup)
beforeEach(() => {
  vi.mocked(listGallery).mockReset()
  vi.mocked(listGallery).mockResolvedValue({ items: [], nextCursor: null })
  vi.mocked(listGalleryTags).mockResolvedValue(['poster', 'warm'])
})

async function openGallery(url: string, owner: Owner | null = null) {
  const root = createRootRoute({
    beforeLoad: async (): Promise<{
      contactUrl: string | null
      owner: Owner | null
    }> => ({ contactUrl: null, owner }),
    component: RootRoute.options.component,
  })
  const routeTree = root.addChildren([
    createRoute({ ...Route.options, getParentRoute: () => root, path: '/' }),
  ])
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [url] }),
    routeTree,
  })
  await act(() => router.load())
  const view = render(<RouterProvider router={router as never} />)
  return { router, view }
}

it('restores a shared filtered URL, including after a reload', async () => {
  const url = '/?q=warm&tags=%5B%22poster%22%2C%22warm%22%5D&type=image'
  const { view } = await openGallery(url)
  expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('warm')
  expect(screen.getByDisplayValue('Image')).toBeTruthy()
  expect(
    screen.getByRole('button', { name: 'poster' }).getAttribute('aria-pressed'),
  ).toBe('true')
  expect(
    screen.getByRole('button', { name: 'warm' }).getAttribute('aria-pressed'),
  ).toBe('true')
  expect(listGallery).toHaveBeenLastCalledWith({
    data: { q: 'warm', tags: ['poster', 'warm'], type: 'image' },
  })
  expect(screen.getByText('No items match these filters.')).toBeTruthy()
  view.unmount()
  await openGallery(url)
  expect(listGallery).toHaveBeenLastCalledWith({
    data: { q: 'warm', tags: ['poster', 'warm'], type: 'image' },
  })
})

it('writes combined filters to the URL, supports back, and clears the view', async () => {
  const { router } = await openGallery('/')
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'warm' } })
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))
  await waitFor(() => expect(router.state.location.search.q).toBe('warm'))
  fireEvent.click(screen.getByRole('button', { name: 'poster' }))
  await waitFor(() =>
    expect(router.state.location.search.tags).toEqual(['poster']),
  )
  fireEvent.click(screen.getByRole('button', { name: 'warm' }))
  await waitFor(() =>
    expect(router.state.location.search.tags).toEqual(['poster', 'warm']),
  )
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'image' } })
  await waitFor(() => expect(router.state.location.search.type).toBe('image'))
  await act(() => router.history.back())
  await waitFor(() =>
    expect(screen.getByDisplayValue('All types')).toBeTruthy(),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  await waitFor(() => expect(router.state.location.search).toEqual({}))
  expect(await screen.findByText('Nothing here yet.')).toBeTruthy()
})

it('keeps filters when paging and replaces accumulated items when filters change', async () => {
  const item = (id: string) => ({
    credit: null,
    description: id,
    id,
    image: null,
    note: id,
    publishedAt: 1,
    sourceUrl: null,
    tags: ['warm'],
    title: id,
    type: 'note' as const,
  })
  vi.mocked(listGallery)
    .mockResolvedValueOnce({ items: [item('first')], nextCursor: '1.first' })
    .mockResolvedValueOnce({ items: [item('second')], nextCursor: null })
    .mockResolvedValueOnce({ items: [item('filtered')], nextCursor: null })
  await openGallery('/?q=warm&type=note')
  fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
  expect(await screen.findByRole('link', { name: 'second' })).toBeTruthy()
  expect(listGallery).toHaveBeenLastCalledWith({
    data: { cursor: '1.first', q: 'warm', type: 'note' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'poster' }))
  expect(await screen.findByRole('link', { name: 'filtered' })).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'first' })).toBeNull()
  expect(screen.queryByRole('link', { name: 'second' })).toBeNull()
  expect(listGallery).toHaveBeenLastCalledWith({
    data: { q: 'warm', tags: ['poster'], type: 'note' },
  })
})

it('shows manual add only to the owner', async () => {
  const { view } = await openGallery('/')
  expect(screen.queryByRole('button', { name: 'Add item' })).toBeNull()
  view.unmount()
  await openGallery('/', {
    email: 'owner@example.com',
    image: null,
    name: 'Owner',
  })
  expect(screen.getByRole('button', { name: 'Add item' })).toBeTruthy()
})

it('renders the gallery for malformed search params and omits empty URL filters', async () => {
  const { router } = await openGallery(
    '/?q=%5B42%5D&tags=%5B%22%22%2C%22%20%20%22%2Cnull%5D&type=video&unknown=ignored',
  )
  expect(await screen.findByText('Nothing here yet.')).toBeTruthy()
  expect(router.state.location.search).toEqual({})
  expect(listGallery).toHaveBeenLastCalledWith({ data: {} })
  expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('')
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '   ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))
  await waitFor(() => expect(router.state.location.searchStr).toBe(''))
})

it.each([
  ['NOT_AUTHORIZED', NOT_AUTHORIZED_MESSAGE],
  ['access_denied', 'Sign-in failed. Please try again.'],
])(
  'preserves the %s auth error without sending it as a gallery filter',
  async (error, message) => {
    const { router } = await openGallery(
      `/?error=${error}&q=warm&unknown=ignored`,
    )
    expect(screen.getByRole('alert').textContent).toBe(message)
    expect(router.state.location.search).toEqual({ error, q: 'warm' })
    expect(listGallery).toHaveBeenLastCalledWith({ data: { q: 'warm' } })
  },
)

it('drops malformed auth errors without breaking the gallery', async () => {
  const { router } = await openGallery('/?error=%5B42%5D')
  expect(await screen.findByText('Nothing here yet.')).toBeTruthy()
  expect(screen.queryByRole('alert')).toBeNull()
  expect(router.state.location.search).toEqual({})
})
