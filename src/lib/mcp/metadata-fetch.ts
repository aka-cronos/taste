import { connect } from 'cloudflare:sockets'
import { resolve4, resolve6 } from 'node:dns/promises'
import { isIP } from 'node:net'
import { isPublicRoutableHost } from '@better-auth/core/utils/host'
import { readLimited } from '@/lib/items/fetch-url'

const MAX_METADATA_BYTES = 128 * 1024
const CHUNK_SIZE = /^[\da-f]+$/iu
const BRACKETS = /^\[|\]$/gu
const STATUS = /^HTTP\/1\.[01] (?<status>\d{3}) /u

function decodeChunks(body: Uint8Array) {
  const chunks: Uint8Array[] = []
  let offset = 0
  const decoder = new TextDecoder()
  while (offset < body.length) {
    const end = body.indexOf(13, offset)
    if (end < 0 || body[end + 1] !== 10) {
      throw new Error('Invalid metadata response framing.')
    }
    const line = decoder.decode(body.subarray(offset, end)).split(';')[0] ?? ''
    if (!CHUNK_SIZE.test(line)) {
      throw new Error('Invalid metadata chunk size.')
    }
    const size = Number.parseInt(line, 16)
    offset = end + 2
    if (size === 0) {
      return Buffer.concat(chunks)
    }
    if (
      offset + size + 2 > body.length ||
      body[offset + size] !== 13 ||
      body[offset + size + 1] !== 10
    ) {
      throw new Error('Truncated metadata response.')
    }
    chunks.push(body.subarray(offset, offset + size))
    offset += size + 2
  }
  throw new Error('Truncated metadata response.')
}

export function metadataResponse(bytes: Uint8Array, method: string) {
  const buffer = Buffer.from(bytes)
  const split = buffer.indexOf('\r\n\r\n')
  if (split < 0) {
    throw new Error('Invalid metadata HTTP response.')
  }
  const [statusLine = '', ...lines] = buffer
    .subarray(0, split)
    .toString()
    .split('\r\n')
  const status = Number(STATUS.exec(statusLine)?.groups?.status)
  if (status < 200 || status >= 300 || !Number.isInteger(status)) {
    throw new Error(
      'Metadata must return a successful response; redirects are refused.',
    )
  }
  const headers = new Headers()
  for (const line of lines) {
    const colon = line.indexOf(':')
    if (colon < 1) {
      throw new Error('Invalid metadata HTTP header.')
    }
    headers.append(line.slice(0, colon), line.slice(colon + 1).trim())
  }
  const rawBody = buffer.subarray(split + 4)
  const body =
    headers.get('transfer-encoding')?.toLowerCase() === 'chunked'
      ? decodeChunks(rawBody)
      : rawBody
  const length = headers.get('content-length')
  if (method !== 'HEAD' && length !== null && Number(length) !== body.length) {
    throw new Error('Truncated metadata response.')
  }
  headers.delete('transfer-encoding')
  headers.delete('connection')
  return new Response(
    method === 'HEAD' || status === 204 || status === 205 ? null : body,
    { headers, status },
  )
}

export async function fetchClientMetadataResource(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  const request = new Request(input, init)
  const url = new URL(request.url)
  const host = url.hostname.replace(BRACKETS, '')
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    !isPublicRoutableHost(host) ||
    !['GET', 'HEAD'].includes(request.method)
  ) {
    throw new TypeError('Metadata requires a public HTTPS GET or HEAD URL.')
  }
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10_000)])
  signal.throwIfAborted()
  const answers = isIP(host)
    ? [host]
    : (await Promise.allSettled([resolve4(host), resolve6(host)])).flatMap(
        answer => (answer.status === 'fulfilled' ? answer.value : []),
      )
  const [address] = answers
  if (!address || answers.some(value => !isPublicRoutableHost(value))) {
    throw new TypeError('Metadata must resolve only to public addresses.')
  }
  signal.throwIfAborted()
  // Pin the TCP peer, then verify TLS against the original metadata hostname.
  const tcp = connect(
    { hostname: address, port: 443 },
    { allowHalfOpen: false, secureTransport: 'starttls' },
  )
  const socket = tcp.startTls({ expectedServerHostname: host })
  const abort = () => {
    socket.close().catch(() => undefined)
  }
  signal.addEventListener('abort', abort, { once: true })
  try {
    const headers = new Headers(request.headers)
    headers.set('host', url.host)
    headers.set('connection', 'close')
    headers.set('accept-encoding', 'identity')
    headers.delete('content-length')
    headers.delete('transfer-encoding')
    const writer = socket.writable.getWriter()
    await writer.write(
      new TextEncoder().encode(
        `${request.method} ${url.pathname}${url.search} HTTP/1.1\r\n${[...headers].map(([key, value]) => `${key}: ${value}\r\n`).join('')}\r\n`,
      ),
    )
    writer.releaseLock()
    const bytes = await readLimited(
      new Response(socket.readable),
      MAX_METADATA_BYTES,
    )
    signal.throwIfAborted()
    return metadataResponse(bytes, request.method)
  } finally {
    signal.removeEventListener('abort', abort)
    await socket.close().catch(() => undefined)
  }
}
