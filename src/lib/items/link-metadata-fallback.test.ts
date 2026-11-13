// @vitest-environment node
import { resolve4, resolve6 } from 'node:dns/promises'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ingestItem } from '@/lib/items/ingest'
import { fetchLinkMetadata } from '@/lib/items/link-metadata'
import { getPublishedItem, listPublishedItems } from '@/lib/items/repository'
import { createTestD1 } from '@/test/d1'

vi.mock('node:dns/promises', () => ({ resolve4: vi.fn(), resolve6: vi.fn() }))
const fetcher = vi.fn()
const sourceUrl = 'https://example.com/reference'
const emptyMetadata = { description: '', image: undefined, title: null }
const bucket = { delete: vi.fn(), put: vi.fn() }

beforeEach(() => {
  vi.stubGlobal('fetch', fetcher)
  fetcher.mockReset()
  vi.clearAllMocks()
  vi.mocked(resolve4).mockResolvedValue(['93.184.216.34'])
  vi.mocked(resolve6).mockResolvedValue([])
})
afterEach(() => vi.unstubAllGlobals())

it.each([301, 302, 307, 308, 403, 404, 429, 500])(
  'publishes and deduplicates an ordinary link despite HTTP %s, preserving user content',
  async status => {
    const { db } = createTestD1()
    fetcher.mockResolvedValueOnce(
      new Response(null, {
        headers: { location: 'http://127.0.0.1/private' },
        status,
      }),
    )
    const input = {
      description: 'My description',
      note: 'My note',
      origin: 'manual' as const,
      sourceUrl,
      status: 'published' as const,
      tags: [' Reference '],
      title: 'My title',
      type: 'link' as const,
    }
    const result = await ingestItem({ bucket, db }, input)
    expect(await getPublishedItem(db, result.item.id)).toMatchObject({
      description: 'My description',
      note: 'My note',
      sourceUrl,
      tags: ['reference'],
      title: 'My title',
      type: 'link',
    })
    const duplicate = await ingestItem(
      { bucket, db },
      { ...input, tags: ['new'] },
    )
    expect(duplicate.duplicate).toBe(true)
    expect(duplicate.item.tags).toEqual(['new', 'reference'])
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' })
    expect(bucket.put).not.toHaveBeenCalled()
  },
)

it('publishes a URL-only link with no user title or description', async () => {
  const { db } = createTestD1()
  fetcher.mockRejectedValueOnce(new DOMException('Timed out', 'TimeoutError'))
  const result = await ingestItem(
    { bucket, db },
    {
      origin: 'manual',
      sourceUrl,
      status: 'published',
      tags: ['reference'],
      type: 'link',
    },
  )
  expect(await getPublishedItem(db, result.item.id)).toMatchObject({
    description: '',
    sourceUrl,
    tags: ['reference'],
    title: null,
    type: 'link',
  })
})

it.each([
  () =>
    new Response('Not HTML', {
      headers: { 'content-type': 'application/json' },
    }),
  () =>
    new Response('x'.repeat(1024 * 1024 + 1), {
      headers: { 'content-type': 'text/html' },
    }),
])('ignores unusable or oversized pages (%#)', async response => {
  fetcher.mockResolvedValueOnce(response())
  expect(await fetchLinkMetadata(sourceUrl)).toEqual(emptyMetadata)
})

it('ignores HTML parsing failures', async () => {
  vi.stubGlobal(
    'HTMLRewriter',
    class {
      constructor() {
        throw new Error('Parser failure')
      }
    },
  )
  fetcher.mockResolvedValueOnce(
    new Response('<html>', { headers: { 'content-type': 'text/html' } }),
  )
  expect(await fetchLinkMetadata(sourceUrl)).toEqual(emptyMetadata)
})

it('allows unresolved domains without making an outgoing request', async () => {
  vi.mocked(resolve4).mockRejectedValueOnce(new Error('DNS unavailable'))
  expect(await fetchLinkMetadata(sourceUrl)).toEqual(emptyMetadata)
  expect(fetcher).not.toHaveBeenCalled()
})

it.each([
  'http://127.0.0.1/private',
  'https://user:pass@example.com/',
  'file:///etc/passwd',
])('still rejects unsafe source %s', async url => {
  await expect(fetchLinkMetadata(url)).rejects.toThrow('public')
  expect(fetcher).not.toHaveBeenCalled()
})

it('rejects private DNS answers before fetching or saving the item', async () => {
  const { db } = createTestD1()
  vi.mocked(resolve6).mockResolvedValueOnce(['::1'])
  await expect(
    ingestItem(
      { bucket, db },
      {
        origin: 'manual',
        sourceUrl,
        status: 'published',
        type: 'link',
      },
    ),
  ).rejects.toThrow('public addresses')
  expect(fetcher).not.toHaveBeenCalled()
  expect(bucket.put).not.toHaveBeenCalled()
  expect((await listPublishedItems(db, {})).items).toHaveLength(0)
})
