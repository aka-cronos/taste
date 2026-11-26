const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1'])

/**
 * Local development: `BETTER_AUTH_URL` is plain HTTP on a loopback host.
 * A missing or malformed URL is not local.
 */
export function isLocalAuthURL(authURL: string | undefined) {
  if (!authURL) {
    return false
  }
  let url: URL
  try {
    url = new URL(authURL)
  } catch {
    return false
  }
  return url.protocol === 'http:' && LOOPBACK_HOSTNAMES.has(url.hostname)
}
