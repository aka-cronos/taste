// @vitest-environment node

import { connect } from 'cloudflare:sockets'
import { resolve4, resolve6 } from 'node:dns/promises'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchClientMetadataResource,
  metadataResponse,
} from '@/lib/mcp/metadata-fetch'

vi.mock('node:dns/promises', () => ({ resolve4: vi.fn(), resolve6: vi.fn() }))
vi.mock('cloudflare:sockets', () => ({ connect: vi.fn() }))

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(resolve4).mockResolvedValue(['93.184.216.34'])
  vi.mocked(resolve6).mockResolvedValue([])
})

describe('CIMD network boundary', () => {
  it.each([
    'http://example.com/client.json',
    'https://localhost/a',
    'https://127.1/a',
    'https://10.0.0.1/a',
    'https://169.254.169.254/a',
    'https://[::1]/a',
    'https://[::ffff:127.0.0.1]/a',
    'https://[fc00::1]/a',
    'https://192.0.2.1/a',
    'https://metadata.google.internal/a',
    'https://user:pass@example.com/a',
  ])('blocks %s before connecting', async url => {
    await expect(fetchClientMetadataResource(url)).rejects.toThrow()
    expect(connect).not.toHaveBeenCalled()
  })
  it('rejects mixed public/private DNS responses', async () => {
    vi.mocked(resolve6).mockResolvedValue(['::1'])
    await expect(
      fetchClientMetadataResource('https://example.com/client.json'),
    ).rejects.toThrow('public addresses')
    expect(connect).not.toHaveBeenCalled()
  })
  it('fails closed on DNS failure', async () => {
    vi.mocked(resolve4).mockRejectedValue(new Error('DNS unavailable'))
    await expect(
      fetchClientMetadataResource('https://example.com/client.json'),
    ).rejects.toThrow()
  })
  it('pins the validated address and preserves TLS identity, headers and method', async () => {
    const write = vi.fn()
    const close = vi.fn().mockResolvedValue(undefined)
    const startTls = vi.fn().mockReturnValue({
      close,
      readable: new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{}',
            ),
          )
          controller.close()
        },
      }),
      writable: new WritableStream({ write }),
    })
    vi.mocked(connect).mockReturnValue({ startTls } as unknown as ReturnType<
      typeof connect
    >)
    const response = await fetchClientMetadataResource(
      'https://example.com/client.json',
      { headers: { accept: 'application/json' } },
    )
    expect(await response.json()).toEqual({})
    expect(connect).toHaveBeenCalledWith(
      { hostname: '93.184.216.34', port: 443 },
      { allowHalfOpen: false, secureTransport: 'starttls' },
    )
    expect(startTls).toHaveBeenCalledWith({
      expectedServerHostname: 'example.com',
    })
    expect(new TextDecoder().decode(write.mock.calls[0]?.[0])).toContain(
      'host: example.com',
    )
    expect(close).toHaveBeenCalled()
    expect(resolve4).toHaveBeenCalledTimes(1)
  })
  it('honors an already aborted request', async () => {
    await expect(
      fetchClientMetadataResource('https://example.com/a', {
        signal: AbortSignal.abort(),
      }),
    ).rejects.toThrow()
    expect(connect).not.toHaveBeenCalled()
  })
  it('refuses redirects rather than following them', () => {
    expect(() =>
      metadataResponse(
        new TextEncoder().encode(
          'HTTP/1.1 302 Found\r\nLocation: https://127.0.0.1/\r\n\r\n',
        ),
        'GET',
      ),
    ).toThrow('redirects')
  })
  it('decodes chunked responses and rejects truncation', async () => {
    const response = metadataResponse(
      new TextEncoder().encode(
        'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n2\r\n{}\r\n0\r\n\r\n',
      ),
      'GET',
    )
    expect(await response.json()).toEqual({})
    expect(() =>
      metadataResponse(
        new TextEncoder().encode(
          'HTTP/1.1 200 OK\r\nContent-Length: 10\r\n\r\n{}',
        ),
        'GET',
      ),
    ).toThrow('Truncated')
  })
})
