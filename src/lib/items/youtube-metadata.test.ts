// @vitest-environment node
import { resolve4, resolve6 } from 'node:dns/promises'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fetchLinkMetadata } from '@/lib/items/link-metadata'

vi.mock('node:dns/promises', () => ({ resolve4: vi.fn(), resolve6: vi.fn() }))
const fetcher = vi.fn()
const videoUrl = 'https://www.youtube.com/watch?v=kPr2ZfWJlbE'
const thumbnail = 'https://i.ytimg.com/vi/kPr2ZfWJlbE/hqdefault.jpg'
const jpeg = new Uint8Array([255, 216, 255, 1])

beforeEach(() => {
  vi.stubGlobal('fetch', fetcher)
  fetcher.mockReset()
  vi.mocked(resolve4).mockResolvedValue(['93.184.216.34'])
  vi.mocked(resolve6).mockResolvedValue([])
})
afterEach(() => vi.unstubAllGlobals())

it.each([
  videoUrl,
  `${videoUrl}&t=42`,
  'https://youtube.com/watch?v=kPr2ZfWJlbE',
  'https://m.youtube.com/watch?v=kPr2ZfWJlbE',
  'https://youtu.be/kPr2ZfWJlbE?si=share',
])(
  'gets title and validated thumbnail through oEmbed for %s',
  async sourceUrl => {
    fetcher
      .mockResolvedValueOnce(
        Response.json({ thumbnail_url: thumbnail, title: ' A film & music ' }),
      )
      .mockResolvedValueOnce(
        new Response(jpeg, { headers: { 'content-type': 'image/jpeg' } }),
      )
    expect(await fetchLinkMetadata(sourceUrl)).toEqual({
      description: '',
      image: { bytes: jpeg, contentType: 'image/jpeg' },
      title: 'A film & music',
    })
    const endpoint = new URL(fetcher.mock.calls[0]?.[0])
    expect(endpoint.origin + endpoint.pathname).toBe(
      'https://www.youtube.com/oembed',
    )
    expect(endpoint.searchParams.get('url')).toBe(videoUrl)
    expect(endpoint.searchParams.get('format')).toBe('json')
    expect(fetcher.mock.calls[1]?.[0]).toBe(thumbnail)
    expect(
      fetcher.mock.calls.every(([, options]) => options.redirect === 'manual'),
    ).toBe(true)
  },
)

it.each([
  () => new Response('Blocked', { status: 429 }),
  () => Response.redirect('http://127.0.0.1', 302),
  () =>
    new Response('<html>Consent</html>', {
      headers: { 'content-type': 'text/html' },
    }),
  () => new Response('{', { headers: { 'content-type': 'application/json' } }),
  () => Response.json({ title: 123 }),
  () => Response.json(null),
  () =>
    new Response('x'.repeat(1024 * 1024 + 1), {
      headers: { 'content-type': 'application/json' },
    }),
])(
  'returns URL-only metadata when oEmbed is unavailable or invalid (%#)',
  async response => {
    fetcher.mockResolvedValueOnce(response())
    expect(await fetchLinkMetadata(videoUrl)).toEqual({
      description: '',
      image: undefined,
      title: null,
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  },
)

it('returns URL-only metadata on a network timeout', async () => {
  fetcher.mockRejectedValueOnce(new DOMException('Timed out', 'TimeoutError'))
  expect(await fetchLinkMetadata(videoUrl)).toMatchObject({
    image: undefined,
    title: null,
  })
})

it.each([
  'http://127.0.0.1/cover.jpg',
  'https://user:pass@example.com/cover.jpg',
])('does not fetch unsafe thumbnail %s', async thumbnailUrl => {
  fetcher.mockResolvedValueOnce(
    Response.json({ thumbnail_url: thumbnailUrl, title: 'Film' }),
  )
  expect(await fetchLinkMetadata(videoUrl)).toMatchObject({
    image: undefined,
    title: 'Film',
  })
  expect(fetcher).toHaveBeenCalledTimes(1)
})

it('rejects thumbnails that resolve to private addresses', async () => {
  vi.mocked(resolve4)
    .mockResolvedValueOnce(['93.184.216.34'])
    .mockResolvedValueOnce(['10.0.0.1'])
  fetcher.mockResolvedValueOnce(
    Response.json({ thumbnail_url: thumbnail, title: 'Film' }),
  )
  expect(await fetchLinkMetadata(videoUrl)).toMatchObject({
    image: undefined,
    title: 'Film',
  })
  expect(fetcher).toHaveBeenCalledTimes(1)
})

it.each([
  () => Response.redirect('http://127.0.0.1', 302),
  () =>
    new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }),
  () =>
    new Response('Not an image', { headers: { 'content-type': 'image/jpeg' } }),
])('keeps the title if the thumbnail is rejected (%#)', async response => {
  fetcher
    .mockResolvedValueOnce(
      Response.json({ thumbnail_url: thumbnail, title: 'Film' }),
    )
    .mockResolvedValueOnce(response())
  expect(await fetchLinkMetadata(videoUrl)).toMatchObject({
    image: undefined,
    title: 'Film',
  })
  expect(fetcher).toHaveBeenCalledTimes(2)
})

it.each([
  'https://youtube.com.evil.example/watch?v=kPr2ZfWJlbE',
  'https://youtu.be.evil.example/kPr2ZfWJlbE',
  'https://www.youtube.com/playlist?list=example',
  'https://www.youtube.com/watch?v=invalid',
  'https://youtu.be/kPr2ZfWJlbE/extra',
])(
  'uses regular page fetching for unrecognized video URL %s',
  async sourceUrl => {
    fetcher.mockResolvedValueOnce(new Response('Unavailable', { status: 403 }))
    expect(await fetchLinkMetadata(sourceUrl)).toMatchObject({
      image: undefined,
      title: null,
    })
    expect(fetcher.mock.calls[0]?.[0]).toBe(sourceUrl)
  },
)

it('validates the source URL before choosing oEmbed', async () => {
  await expect(
    fetchLinkMetadata('https://user:pass@youtube.com/watch?v=kPr2ZfWJlbE'),
  ).rejects.toThrow('public')
  expect(fetcher).not.toHaveBeenCalled()
})

it('bounds the oEmbed title without decoding its JSON text as HTML', async () => {
  fetcher.mockResolvedValueOnce(
    Response.json({ title: ` &amp; ${'x'.repeat(600)}` }),
  )
  const metadata = await fetchLinkMetadata(videoUrl)
  expect(metadata.title).toHaveLength(500)
  expect(metadata.title?.startsWith('&amp; ')).toBe(true)
})
