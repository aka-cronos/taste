import { resolve4, resolve6 } from 'node:dns/promises'
import { isIP } from 'node:net'

const IPV4 = /^\d+\.\d+\.\d+\.\d+$/u
const GLOBAL_IPV6 = /^[23]/u
const IP_BRACKETS = /^\[|\]$/gu
const TRAILING_DOT = /\.$/u

export const MAX_PAGE_BYTES = 1024 * 1024

export function isPublicAddress(address: string): boolean {
  if (IPV4.test(address)) {
    const [a = 0, b = 0] = address.split('.').map(Number)
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19))
    )
  }
  // Restrict IPv6 to global unicast; mapped IPv4 and transition networks are excluded.
  if (isIP(address) !== 6) {
    return false
  }
  const value = new URL(`http://[${address}]/`).hostname.slice(1, -1)
  const [prefix, subnet = '0'] = value.split(':')
  return (
    GLOBAL_IPV6.test(value) &&
    !(
      prefix === '2001' &&
      (Number.parseInt(subnet || '0', 16) <= 0x1_ff || subnet === 'db8')
    ) &&
    !value.startsWith('3fff:') &&
    !value.startsWith('2002:')
  )
}

export function publicUrl(value: string) {
  const url = new URL(value)
  const host = url.hostname.replace(IP_BRACKETS, '').replace(TRAILING_DOT, '')
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && url.port !== '80' && url.port !== '443') ||
    !(host.includes('.') || host.includes(':')) ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    (isIP(host) && !isPublicAddress(host))
  ) {
    throw new Error('Use a public HTTP or HTTPS URL.')
  }
  url.hash = ''
  return url
}

export async function readLimited(response: Response, limit: number) {
  const reader = response.body?.getReader()
  if (!reader) {
    return new Uint8Array()
  }
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      // biome-ignore lint/performance/noAwaitInLoops: read the bounded stream sequentially
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      length += value.byteLength
      if (length > limit) {
        throw new Error('The file or page is too large.')
      }
      chunks.push(value)
    }
  } finally {
    await reader.cancel()
    reader.releaseLock()
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}

export async function fetchPublicUrl(value: string, limit: number) {
  const url = publicUrl(value)
  const host = url.hostname.replace(IP_BRACKETS, '')
  if (!isIP(host)) {
    const answers = await Promise.allSettled([resolve4(host), resolve6(host)])
    const addresses = answers.flatMap(answer =>
      answer.status === 'fulfilled' ? answer.value : [],
    )
    if (
      !addresses.length ||
      addresses.some(address => !isPublicAddress(address))
    ) {
      throw new Error('The URL must resolve to public addresses.')
    }
  }
  // Workers global fetch also blocks private destinations at connection time,
  // including a DNS change between the check above and the actual connection.
  const response = await fetch(url.href, {
    headers: { accept: 'text/html, image/*' },
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error('The URL could not be fetched. Redirects are not followed.')
  }
  const bytes = await readLimited(response, limit)
  return {
    bytes,
    contentType:
      response.headers
        .get('content-type')
        ?.split(';')[0]
        ?.trim()
        .toLowerCase() ?? '',
  }
}
