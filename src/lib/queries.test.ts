import {
  dehydrate,
  focusManager,
  hydrate,
  InfiniteQueryObserver,
  QueryObserver,
} from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { getBootstrap } from '@/lib/bootstrap'
import { getOwnerItem } from '@/lib/items/manage-server'
import {
  getGalleryItem,
  listGallery,
  listGalleryTags,
} from '@/lib/items/server'
import {
  bootstrapQuery,
  galleryQuery,
  itemQuery,
  tagsQuery,
} from '@/lib/queries'
import {
  bootstrapKey,
  createQueryClient,
  resetSession,
} from '@/lib/query-client'

vi.mock('@/lib/items/server', () => ({
  getGalleryItem: vi.fn(),
  listGallery: vi.fn(),
  listGalleryTags: vi.fn(),
}))
vi.mock('@/lib/items/manage-server', () => ({ getOwnerItem: vi.fn() }))

afterEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
})

it('reuses normalized filters for 30 seconds, then revalidates on reuse without polling', async () => {
  vi.useFakeTimers()
  vi.mocked(listGallery).mockResolvedValue({ items: [], nextCursor: null })
  const client = createQueryClient()
  const options = galleryQuery({ q: ' a ', tags: [' Warm ', 'warm'] })
  await client.ensureInfiniteQueryData(options)
  await client.ensureInfiniteQueryData({
    ...galleryQuery({ q: 'a', tags: ['warm'] }),
    revalidateIfStale: true,
  })
  expect(listGallery).toHaveBeenCalledTimes(1)
  vi.advanceTimersByTime(30_001)
  expect(listGallery).toHaveBeenCalledTimes(1)
  await client.ensureInfiniteQueryData({ ...options, revalidateIfStale: true })
  await vi.waitFor(() => expect(listGallery).toHaveBeenCalledTimes(2))
  client.clear()
})

it('retains subsequent pages when returning to the same filter', async () => {
  vi.mocked(listGallery)
    .mockResolvedValueOnce({ items: [], nextCursor: 'next' })
    .mockResolvedValue({ items: [], nextCursor: null })
  const client = createQueryClient()
  const observer = new InfiniteQueryObserver(client, galleryQuery({}))
  const unsubscribe = observer.subscribe(() => undefined)
  await observer.refetch()
  await observer.fetchNextPage()
  unsubscribe()
  const data = await client.ensureInfiniteQueryData(galleryQuery({}))
  expect(data.pageParams).toEqual([undefined, 'next'])
  expect(listGallery).toHaveBeenCalledTimes(2)
  client.clear()
})

it('hydrates completed SSR work without requesting it again and isolates request caches', async () => {
  vi.mocked(listGalleryTags).mockResolvedValue(['warm'])
  const server = createQueryClient()
  await server.ensureQueryData(tagsQuery())
  const browser = createQueryClient()
  hydrate(browser, dehydrate(server))
  await browser.ensureQueryData(tagsQuery())
  const observer = new QueryObserver(browser, tagsQuery())
  const unsubscribe = observer.subscribe(() => undefined)
  expect(listGalleryTags).toHaveBeenCalledTimes(1)
  expect(createQueryClient().getQueryData(tagsQuery().queryKey)).toBeUndefined()
  unsubscribe()
  server.clear()
  browser.clear()
})

it('separates owner editor data from public detail data', async () => {
  vi.mocked(getGalleryItem).mockResolvedValue(null)
  vi.mocked(getOwnerItem).mockResolvedValue({
    editor: null,
    item: null,
    tags: [],
  })
  const client = createQueryClient()
  await client.ensureQueryData(itemQuery('a', undefined))
  client.setQueryData(bootstrapKey, { owner: { email: 'owner@example.com' } })
  await client.ensureQueryData(itemQuery('a', 'owner@example.com'))
  expect(getGalleryItem).toHaveBeenCalledOnce()
  expect(getOwnerItem).toHaveBeenCalledOnce()
  client.clear()
})

it('cancels private and bootstrap requests on sign-out, including late results', async () => {
  const client = createQueryClient()
  const owner = { email: 'owner@example.com', image: null, name: 'Owner' }
  client.setQueryData(bootstrapKey, { contactUrl: null, inboxCount: 1, owner })
  let complete: (value: string) => void = () => undefined
  const pending = client
    .fetchQuery({
      queryFn: () =>
        new Promise<string>(resolve => {
          complete = resolve
        }),
      queryKey: ['owner', owner.email, 'item', 'a'],
    })
    .catch(() => undefined)
  resetSession(client)
  complete('private')
  await pending
  expect(
    client.getQueryData(['owner', owner.email, 'item', 'a']),
  ).toBeUndefined()
  expect(client.getQueryData(bootstrapKey)).toMatchObject({
    inboxCount: 0,
    owner: null,
  })
})

it('clears private data and notifies guarded routes after detected session loss', async () => {
  const changed = vi.fn()
  const client = createQueryClient(changed)
  client.setQueryData(['owner', 'owner@example.com', 'item', 'a'], 'private')
  vi.mocked(getBootstrap).mockResolvedValue({
    contactUrl: null,
    inboxCount: 0,
    owner: null,
  })
  await client.fetchQuery(bootstrapQuery())
  expect(
    client.getQueryData(['owner', 'owner@example.com', 'item', 'a']),
  ).toBeUndefined()
  expect(changed).toHaveBeenCalledOnce()
})

it('invalidates fresh navigation data immediately after mutations', async () => {
  vi.mocked(listGalleryTags)
    .mockResolvedValueOnce(['old'])
    .mockResolvedValue(['new'])
  const client = createQueryClient()
  const observer = new QueryObserver(client, tagsQuery())
  const unsubscribe = observer.subscribe(() => undefined)
  await observer.refetch()
  await client.invalidateQueries()
  expect(observer.getCurrentResult().data).toEqual(['new'])
  expect(listGalleryTags).toHaveBeenCalledTimes(2)
  unsubscribe()
  client.clear()
})

it('rejects a loader that tries to start owner work after sign-out', async () => {
  const client = createQueryClient()
  resetSession(client)
  await expect(
    client.ensureQueryData(itemQuery('a', 'owner@example.com')),
  ).rejects.toThrow()
  expect(getOwnerItem).not.toHaveBeenCalled()
  client.clear()
})

it('refreshes expired active data on focus without polling', async () => {
  vi.useFakeTimers()
  vi.mocked(listGalleryTags).mockResolvedValue(['warm'])
  const client = createQueryClient()
  client.mount()
  const observer = new QueryObserver(client, tagsQuery())
  const unsubscribe = observer.subscribe(() => undefined)
  await observer.refetch()
  focusManager.setFocused(false)
  vi.advanceTimersByTime(30_001)
  expect(listGalleryTags).toHaveBeenCalledTimes(1)
  focusManager.setFocused(true)
  await vi.waitFor(() => expect(listGalleryTags).toHaveBeenCalledTimes(2))
  unsubscribe()
  client.unmount()
  client.clear()
  focusManager.setFocused(undefined)
})

it('clears the owner UI and cache when an independently authorized read returns 401', async () => {
  const changed = vi.fn()
  const client = createQueryClient(changed)
  client.setQueryData(bootstrapKey, {
    inboxCount: 2,
    owner: { email: 'owner@example.com' },
  })
  client.setQueryData(['owner', 'owner@example.com', 'item', 'a'], 'private')
  const error = Object.assign(new Error('Unauthorized'), { status: 401 })
  await expect(
    client.fetchQuery({
      queryFn: () => Promise.reject(error),
      queryKey: ['owner', 'owner@example.com', 'inbox'],
    }),
  ).rejects.toThrow()
  expect(client.getQueryData(bootstrapKey)).toMatchObject({
    inboxCount: 0,
    owner: null,
  })
  expect(client.getQueryCache().findAll({ queryKey: ['owner'] })).toHaveLength(
    0,
  )
  expect(changed).toHaveBeenCalledOnce()
})
