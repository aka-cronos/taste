// @vitest-environment node
import { resolve4, resolve6 } from 'node:dns/promises'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  fetchPublicUrl,
  isPublicAddress,
  publicUrl,
  readLimited,
} from '@/lib/items/fetch-url'

vi.mock('node:dns/promises', () => ({ resolve4: vi.fn(), resolve6: vi.fn() }))
const fetcher = vi.fn()
beforeEach(() => {
  vi.stubGlobal('fetch', fetcher)
  fetcher.mockReset()
  vi.mocked(resolve4).mockResolvedValue(['93.184.216.34'])
  vi.mocked(resolve6).mockResolvedValue([])
})
afterEach(() => vi.unstubAllGlobals())

it.each([
  'file:///etc/passwd',
  'ftp://example.com',
  'https://user:pass@example.com',
  'http://localhost/',
  'http://localhost./',
  'http://a.local',
  'http://10.0.0.1',
  'http://172.16.0.1',
  'http://192.168.1.1',
  'http://169.254.169.254',
  'http://2130706433',
  'http://0x7f000001',
  'http://100.64.0.1',
  'http://[::1]',
  'http://[::ffff:127.0.0.1]',
  'http://[fd00::1]',
  'http://[fe80::1]',
  'https://example.com:8080',
])('rejects unsafe URL %s', value => {
  expect(() => publicUrl(value)).toThrow()
})

it('rejects hostnames resolving to any private address', async () => {
  vi.mocked(resolve6).mockResolvedValue(['::1'])
  await expect(fetchPublicUrl('https://example.com/', 100)).rejects.toThrow(
    'public addresses',
  )
  expect(fetcher).not.toHaveBeenCalled()
})

it('fails closed when DNS cannot resolve', async () => {
  vi.mocked(resolve4).mockRejectedValue(new Error('DNS failure'))
  await expect(fetchPublicUrl('https://example.com/', 100)).rejects.toThrow(
    'public addresses',
  )
})

it('refuses redirects rather than following them to private networks', async () => {
  fetcher.mockResolvedValue(Response.redirect('http://127.0.0.1', 302))
  await expect(fetchPublicUrl('https://example.com/', 100)).rejects.toThrow(
    'Redirects',
  )
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' })
})

it('bounds streamed data without trusting content-length', async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(6))
      controller.enqueue(new Uint8Array(6))
      controller.close()
    },
  })
  await expect(
    readLimited(
      new Response(stream, { headers: { 'content-length': '1' } }),
      10,
    ),
  ).rejects.toThrow('too large')
  expect(await readLimited(new Response('hello'), 10)).toEqual(
    new TextEncoder().encode('hello'),
  )
})

it('allows public IPv6 while blocking transition and documentation ranges', () => {
  expect(isPublicAddress('2001:4860:4860::8888')).toBe(true)
  expect(isPublicAddress('2606:4700:4700::1111')).toBe(true)
  expect(isPublicAddress('2001:0000::1')).toBe(false)
  expect(isPublicAddress('2001:db8::1')).toBe(false)
  expect(isPublicAddress('2002:7f00:1::')).toBe(false)
})
