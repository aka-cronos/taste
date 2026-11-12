import { getMediaStatus } from '@/lib/items/repository'

const PRIVATE_CACHE = 'private, no-store'

interface ServeMediaOptions {
  bucket: R2Bucket
  db: D1Database
  /** Checked only for inbox files, so public requests skip the session. */
  isOwner: () => Promise<boolean>
  key: string
  request: Request
}

function notFound() {
  return new Response('Not found', {
    headers: { 'cache-control': 'no-store' },
    status: 404,
  })
}

/**
 * Serves a stored file from R2. Files of published items are public; files of
 * inbox items are visible to the owner only, and a key no item points at is
 * not served at all.
 */
export async function serveMedia({
  bucket,
  db,
  isOwner,
  key,
  request,
}: ServeMediaOptions) {
  const status = key ? await getMediaStatus(db, key) : null
  if (!status || (status === 'inbox' && !(await isOwner()))) {
    return notFound()
  }
  const object = await bucket.get(key, { onlyIf: request.headers })
  if (!object) {
    return notFound()
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('cache-control', PRIVATE_CACHE)
  // Stored files come from the web. Never let one run as a page on this
  // origin (an SVG with a script, an HTML file with an image extension).
  headers.set('content-security-policy', "default-src 'none'; sandbox")
  headers.set('x-content-type-options', 'nosniff')

  if (!('body' in object)) {
    // The client's copy matches (If-None-Match), so R2 skipped the body.
    return new Response(null, { headers, status: 304 })
  }
  return new Response(object.body, { headers })
}
