import {
  createBrowserHistory,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
  RouterProvider,
} from '@tanstack/react-router'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Owner } from '@/lib/auth/owner'
import { addManualItem } from '@/lib/items/add'
import type { ItemEditorData } from '@/lib/items/edit-input'
import {
  changeItemVisibility,
  getOwnerItem,
  permanentlyDeleteItem,
  saveItemEdits,
} from '@/lib/items/manage-server'
import type { GalleryItem } from '@/lib/items/model'
import {
  getGalleryItem,
  listGallery,
  listGalleryTags,
} from '@/lib/items/server'
import { Route as RootRoute } from '@/routes/__root'
import { Route as GalleryRoute } from '@/routes/index'
import { Route as ItemRoute } from '@/routes/items/$id'

vi.mock('@/lib/items/add', () => ({ addManualItem: vi.fn() }))
vi.mock('@/lib/items/server', () => ({
  getGalleryItem: vi.fn(),
  listGallery: vi.fn(),
  listGalleryTags: vi.fn(),
}))
vi.mock('@/lib/items/manage-server', () => ({
  changeItemVisibility: vi.fn(),
  getOwnerItem: vi.fn(),
  permanentlyDeleteItem: vi.fn(),
  saveItemEdits: vi.fn(),
}))
vi.mock('@/lib/auth/session', () => ({ getOwner: vi.fn() }))
vi.mock('@/lib/items/inbox-server', () => ({ getInboxCount: vi.fn() }))
vi.mock('@/lib/site-config', () => ({ getContactUrl: vi.fn() }))
window.scrollTo = () => undefined

const owner: Owner = { email: 'owner@example.com', image: null, name: 'Owner' }
let items: Record<string, GalleryItem>

function note(id: string, title: string): GalleryItem {
  return {
    credit: null,
    description: `${title} description`,
    id,
    image: null,
    note: `${title} note`,
    publishedAt: 1,
    sourceUrl: null,
    tags: [],
    title,
    type: 'note',
  }
}

function editorFor(item: GalleryItem): ItemEditorData {
  return {
    creditAuthor: '',
    creditUrl: '',
    description: item.description,
    id: item.id,
    note: item.note ?? '',
    status: 'published',
    tags: item.tags,
    title: item.title ?? '',
  }
}

function itemFor(options: { data?: unknown } | undefined) {
  return items[(options?.data as { id?: string } | undefined)?.id ?? '']
}

beforeEach(() => {
  vi.resetAllMocks()
  items = { a: note('a', 'Alpha'), b: note('b', 'Beta') }
  vi.mocked(listGallery).mockImplementation(() =>
    Promise.resolve({ items: Object.values(items), nextCursor: null }),
  )
  vi.mocked(listGalleryTags).mockResolvedValue([])
  vi.mocked(getGalleryItem).mockImplementation(options =>
    Promise.resolve(itemFor(options) ?? null),
  )
  vi.mocked(getOwnerItem).mockImplementation(options => {
    const item = itemFor(options)
    return Promise.resolve({
      editor: item ? editorFor(item) : null,
      item: item ?? null,
      tags: [],
    })
  })
})
let browserHistory: RouterHistory | undefined
afterEach(() => {
  cleanup()
  browserHistory?.destroy()
  browserHistory = undefined
})

function openBrowserApp() {
  window.history.replaceState(null, '', '/')
  browserHistory = createBrowserHistory()
  return openApp({ history: browserHistory, signedIn: true })
}

async function blockedBack(
  router: Awaited<ReturnType<typeof openApp>>['router'],
) {
  const rollback = new Promise<void>(resolve => {
    window.addEventListener(
      'popstate',
      () => {
        window.addEventListener('popstate', () => resolve(), { once: true })
      },
      { once: true },
    )
  })
  await act(async () => {
    router.history.back()
    await rollback
  })
}

async function openApp({
  history,
  signedIn = false,
  url = '/',
}: {
  history?: RouterHistory
  signedIn?: boolean
  url?: string
}) {
  const root = createRootRoute({
    beforeLoad: (): Promise<{
      contactUrl: string | null
      inboxCount: number
      owner: Owner | null
    }> =>
      Promise.resolve({
        contactUrl: null,
        inboxCount: 0,
        owner: signedIn ? owner : null,
      }),
    component: RootRoute.options.component,
  })
  const routeTree = root.addChildren([
    createRoute({
      ...GalleryRoute.options,
      getParentRoute: () => root,
      path: '/',
    }),
    createRoute({
      ...ItemRoute.options,
      getParentRoute: () => root,
      path: '/items/$id',
    }),
  ])
  const router = createRouter({
    history: history ?? createMemoryHistory({ initialEntries: [url] }),
    routeTree,
  })
  await act(() => router.load())
  const view = render(<RouterProvider router={router as never} />)
  return { router, view }
}

function drawer(name: string) {
  return screen.findByRole('dialog', { name })
}

async function waitForNoDrawer() {
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
}

it('opens a card in a drawer over the gallery with the item URL in the address bar', async () => {
  const { router } = await openApp({})
  fireEvent.click(screen.getByRole('link', { name: 'Alpha' }))
  const dialog = await drawer('Alpha')
  expect(within(dialog).getByText('Alpha description')).toBeTruthy()
  // The address bar shows the item page; the app stays on the gallery.
  expect(router.history.location.pathname).toBe('/items/a')
  expect(router.state.location.pathname).toBe('/')
  expect(router.state.location.search).toEqual({ item: 'a' })
  // The gallery stays rendered and is not reloaded.
  expect(screen.getByRole('link', { name: 'Beta' })).toBeTruthy()
  expect(listGallery).toHaveBeenCalledOnce()
  // Visitors see the detail only.
  expect(within(dialog).queryByRole('button', { name: 'Edit item' })).toBeNull()
})

it('renders the full item page on a direct visit, with ?edit=true', async () => {
  const { view } = await openApp({ url: '/items/a' })
  expect(screen.getByRole('heading', { level: 1, name: 'Alpha' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Gallery' })).toBeTruthy()
  expect(screen.queryByRole('dialog')).toBeNull()
  view.unmount()
  await openApp({ signedIn: true, url: '/items/a?edit=true' })
  expect(screen.getByRole('button', { name: 'Cancel editing' })).toBeTruthy()
  expect(screen.getByLabelText('Title')).toBeTruthy()
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('renders the full item page when reloading an open drawer', async () => {
  const { router, view } = await openApp({})
  fireEvent.click(screen.getByRole('link', { name: 'Alpha' }))
  await drawer('Alpha')
  view.unmount()
  // A new router over the same history entry is a page reload.
  await openApp({ history: router.history })
  expect(
    await screen.findByRole('heading', { level: 1, name: 'Alpha' }),
  ).toBeTruthy()
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('swaps the drawer between items and walks back through them', async () => {
  const { router } = await openApp({})
  fireEvent.click(screen.getByRole('link', { name: 'Alpha' }))
  await drawer('Alpha')
  fireEvent.click(screen.getByRole('link', { name: 'Beta' }))
  await drawer('Beta')
  expect(router.history.location.pathname).toBe('/items/b')
  await act(() => router.history.back())
  await drawer('Alpha')
  expect(router.history.location.pathname).toBe('/items/a')
  await act(() => router.history.back())
  await waitForNoDrawer()
  expect(router.history.location.pathname).toBe('/')
})

it('closes the drawer from its close button and keeps the filters', async () => {
  const { router } = await openApp({ url: '/?q=alpha' })
  fireEvent.click(screen.getByRole('link', { name: 'Alpha' }))
  const dialog = await drawer('Alpha')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
  await waitForNoDrawer()
  expect(router.state.location.search).toEqual({ q: 'alpha' })
  expect(router.history.location.href).toBe('/?q=alpha')
})

it('lets the owner edit and save inside the drawer', async () => {
  vi.mocked(saveItemEdits).mockImplementation(options => {
    const data = options?.data as ItemEditorData
    items.a = { ...(items.a as GalleryItem), title: data.title }
    return Promise.resolve()
  })
  await openApp({ signedIn: true })
  fireEvent.click(screen.getByRole('link', { name: 'Alpha' }))
  let dialog = await drawer('Alpha')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Edit item' }))
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Cancel editing' }),
  )
  expect(within(dialog).queryByLabelText('Title')).toBeNull()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Edit item' }))
  fireEvent.change(within(dialog).getByLabelText('Title'), {
    target: { value: 'Updated' },
  })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))
  dialog = await drawer('Updated')
  expect(saveItemEdits).toHaveBeenCalledWith({
    data: expect.objectContaining({ id: 'a', title: 'Updated' }),
  })
  expect(within(dialog).getByRole('button', { name: 'Edit item' })).toBeTruthy()
  // The card behind the drawer is refreshed too.
  expect(await screen.findByRole('link', { name: 'Updated' })).toBeTruthy()
})

it('asks before discarding unsaved edits when switching items or closing', async () => {
  const { router } = await openApp({ signedIn: true })
  fireEvent.click(screen.getByRole('link', { name: 'Alpha' }))
  let dialog = await drawer('Alpha')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Edit item' }))
  fireEvent.change(within(dialog).getByLabelText('Title'), {
    target: { value: 'Unsaved' },
  })
  fireEvent.click(screen.getByRole('link', { name: 'Beta' }))
  let confirm = await screen.findByRole('alertdialog', {
    name: 'Discard changes?',
  })
  expect(router.state.location.search).toEqual({ item: 'a' })
  fireEvent.click(within(confirm).getByRole('button', { name: 'Keep editing' }))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  dialog = await drawer('Alpha')
  expect(
    (within(dialog).getByLabelText('Title') as HTMLInputElement).value,
  ).toBe('Unsaved')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
  confirm = await screen.findByRole('alertdialog', { name: 'Discard changes?' })
  fireEvent.click(within(confirm).getByRole('button', { name: 'Discard' }))
  await waitForNoDrawer()
  expect(router.state.location.search).toEqual({})
  expect(router.history.location.pathname).toBe('/')
})

it('switches items without asking when the edit form is unchanged', async () => {
  await openApp({ signedIn: true })
  fireEvent.click(screen.getByRole('link', { name: 'Alpha' }))
  const dialog = await drawer('Alpha')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Edit item' }))
  fireEvent.click(screen.getByRole('link', { name: 'Beta' }))
  await drawer('Beta')
  expect(screen.queryByRole('alertdialog')).toBeNull()
})

it('opens Add item in a drawer and asks before discarding a draft', async () => {
  const { router } = await openApp({ signedIn: true })
  expect(screen.queryByLabelText('URL')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
  let dialog = await drawer('Add item')
  expect(router.state.location.search).toEqual({ add: true })
  expect(router.history.location.href).toBe('/')
  fireEvent.change(within(dialog).getByLabelText('URL'), {
    target: { value: 'https://example.com/' },
  })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
  let confirm = await screen.findByRole('alertdialog', {
    name: 'Discard changes?',
  })
  fireEvent.click(within(confirm).getByRole('button', { name: 'Keep editing' }))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  dialog = await drawer('Add item')
  // Opening an item while drafting asks too.
  fireEvent.click(screen.getByRole('link', { name: 'Alpha' }))
  confirm = await screen.findByRole('alertdialog', { name: 'Discard changes?' })
  fireEvent.click(within(confirm).getByRole('button', { name: 'Discard' }))
  await drawer('Alpha')
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Add item' })).toBeNull(),
  )
  expect(router.state.location.search).toEqual({ item: 'a' })
  fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
  dialog = await drawer('Add item')
  expect((within(dialog).getByLabelText('URL') as HTMLInputElement).value).toBe(
    '',
  )
})

function deferred() {
  let resolve: () => void = () => undefined
  let reject: (error: Error) => void = () => undefined
  const promise = new Promise<void>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, reject, resolve }
}

async function tryLeavingPendingDrawer(
  router: Awaited<ReturnType<typeof openApp>>['router'],
  dialog: HTMLElement,
  search: { add: true } | { item: string },
) {
  const attempt = async (leave: () => unknown) => {
    await act(() => {
      leave()
    })
    expect(router.state.location.search).toEqual(search)
    expect(
      screen.queryByRole('alertdialog', { name: 'Discard changes?' }),
    ).toBeNull()
    expect(dialog.isConnected).toBe(true)
  }
  await attempt(() =>
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' })),
  )
  await attempt(() =>
    fireEvent.keyDown(dialog, { code: 'Escape', key: 'Escape' }),
  )
  await blockedBack(router)
  expect(router.state.location.search).toEqual(search)
  await attempt(() =>
    fireEvent.click(screen.getByRole('link', { name: 'Beta' })),
  )
}

it.each(['success', 'failure'] as const)(
  'blocks closing, Back and item switching until an add request settles with %s',
  async outcome => {
    const request = deferred()
    vi.mocked(addManualItem).mockImplementation(async () => {
      await request.promise
      return {
        duplicate: false,
        item: {
          description: '',
          id: 'added',
          note: null,
          source_url: null,
          status: 'published',
          tags: [],
          title: null,
          type: 'link',
        },
      }
    })
    const { router } = await openBrowserApp()
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
    const dialog = await drawer('Add item')
    fireEvent.change(within(dialog).getByLabelText('URL'), {
      target: { value: 'https://example.com/' },
    })
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Publish item' }),
    )
    await waitFor(() => expect(addManualItem).toHaveBeenCalledOnce())
    await tryLeavingPendingDrawer(router, dialog, { add: true })
    expect(router.history.location.href).toBe('/')
    await act(() => {
      if (outcome === 'success') {
        request.resolve()
      } else {
        request.reject(new Error('Save failed'))
      }
    })
    if (outcome === 'success') {
      await waitForNoDrawer()
      expect(router.state.location.search).toEqual({})
    } else {
      expect(await within(dialog).findByRole('alert')).toBeTruthy()
      expect(
        (within(dialog).getByLabelText('URL') as HTMLInputElement).value,
      ).toBe('https://example.com/')
      await act(() => router.history.back())
      const confirm = await screen.findByRole('alertdialog', {
        name: 'Discard changes?',
      })
      fireEvent.click(within(confirm).getByRole('button', { name: 'Discard' }))
      await waitForNoDrawer()
    }
  },
)

it.each(['success', 'failure'] as const)(
  'blocks closing, Back and item switching until an edit request settles with %s',
  async outcome => {
    const request = deferred()
    vi.mocked(saveItemEdits).mockImplementation(async () => {
      await request.promise
      items.a = { ...(items.a as GalleryItem), title: 'Updated' }
    })
    const { router } = await openBrowserApp()
    fireEvent.click(screen.getByRole('link', { name: 'Alpha' }))
    const dialog = await drawer('Alpha')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Edit item' }))
    fireEvent.change(within(dialog).getByLabelText('Title'), {
      target: { value: 'Updated' },
    })
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Save changes' }),
    )
    await waitFor(() => expect(saveItemEdits).toHaveBeenCalledOnce())
    await tryLeavingPendingDrawer(router, dialog, { item: 'a' })
    expect(router.history.location.pathname).toBe('/items/a')
    await act(() => {
      if (outcome === 'success') {
        request.resolve()
      } else {
        request.reject(new Error('Save failed'))
      }
    })
    if (outcome === 'success') {
      const updated = await drawer('Updated')
      expect(
        within(updated).getByRole('button', { name: 'Edit item' }),
      ).toBeTruthy()
      await act(() => router.history.back())
      await waitForNoDrawer()
    } else {
      expect(await within(dialog).findByRole('alert')).toBeTruthy()
      expect(
        (within(dialog).getByLabelText('Title') as HTMLInputElement).value,
      ).toBe('Updated')
      await act(() => router.history.back())
      const confirm = await screen.findByRole('alertdialog', {
        name: 'Discard changes?',
      })
      fireEvent.click(within(confirm).getByRole('button', { name: 'Discard' }))
      await waitForNoDrawer()
    }
  },
)

it.each(['visibility', 'delete'] as const)(
  'blocks navigation during a pending %s mutation and releases it after failure',
  async operation => {
    const request = deferred()
    vi.mocked(changeItemVisibility).mockReturnValue(request.promise)
    vi.mocked(permanentlyDeleteItem).mockReturnValue(request.promise)
    const { router } = await openBrowserApp()
    fireEvent.click(screen.getByRole('link', { name: 'Alpha' }))
    const dialog = await drawer('Alpha')
    if (operation === 'visibility') {
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Move to inbox' }),
      )
      await waitFor(() => expect(changeItemVisibility).toHaveBeenCalledOnce())
      await tryLeavingPendingDrawer(router, dialog, { item: 'a' })
    } else {
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Delete item' }),
      )
      fireEvent.click(
        await screen.findByRole('button', { name: 'Delete permanently' }),
      )
      await waitFor(() => expect(permanentlyDeleteItem).toHaveBeenCalledOnce())
      await blockedBack(router)
      await act(() => {
        router.navigate({ search: { item: 'b' }, to: '/' } as never)
      })
      expect(router.state.location.search).toEqual({ item: 'a' })
      expect(screen.getByRole('alertdialog').textContent).toContain('Deleting…')
    }
    await act(() => request.reject(new Error('Request failed')))
    expect(await screen.findByRole('alert')).toBeTruthy()
    if (operation === 'delete') {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    }
    await act(() => router.history.back())
    await waitForNoDrawer()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  },
)

it('closes after a pending delete succeeds without offering to discard or blocking its completion', async () => {
  const request = deferred()
  vi.mocked(permanentlyDeleteItem).mockReturnValue(request.promise)
  const { router } = await openBrowserApp()
  fireEvent.click(screen.getByRole('link', { name: 'Alpha' }))
  const dialog = await drawer('Alpha')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete item' }))
  fireEvent.click(
    await screen.findByRole('button', { name: 'Delete permanently' }),
  )
  await waitFor(() => expect(permanentlyDeleteItem).toHaveBeenCalledOnce())
  await blockedBack(router)
  expect(router.state.location.search).toEqual({ item: 'a' })
  await act(() => request.resolve())
  await waitForNoDrawer()
  expect(router.state.location.search).toEqual({})
  expect(screen.queryByRole('alertdialog')).toBeNull()
})
