// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { serveMedia } from '@/lib/items/media'
import { createTestD1 } from '@/test/d1'
import { insertItem } from '@/test/items'

let db: D1Database

const ETAG = '"abc"'

// Just enough of R2: one stored file per key, honoring If-None-Match.
const bucket = {
  get: (key: string, options?: { onlyIf?: Headers }) => {
    const metadata = {
      httpEtag: ETAG,
      writeHttpMetadata: (headers: Headers) =>
        headers.set('content-type', 'image/png'),
    }
    if (key.endsWith('missing.png')) {
      return Promise.resolve(null)
    }
    if (options?.onlyIf?.get('if-none-match') === ETAG) {
      return Promise.resolve(metadata)
    }
    return Promise.resolve({ ...metadata, body: `bytes of ${key}` })
  },
} as unknown as R2Bucket

function serve(key: string, isOwner = false, headers?: HeadersInit) {
  return serveMedia({
    bucket,
    db,
    isOwner: () => Promise.resolve(isOwner),
    key,
    request: new Request(`https://taste.test/media/${key}`, { headers }),
  })
}

beforeEach(() => {
  const test = createTestD1()
  ;({ db } = test)
  insertItem(test.sqlite, { id: 'pub', imageKey: 'k/pub.png', type: 'image' })
  insertItem(test.sqlite, {
    id: 'inbox',
    imageKey: 'k/inbox.png',
    status: 'inbox',
    type: 'image',
  })
  insertItem(test.sqlite, {
    id: 'gone',
    imageKey: 'k/missing.png',
    type: 'image',
  })
})

describe('serveMedia', () => {
  it('serves published files without caching so hiding takes effect', async () => {
    const response = await serve('k/pub.png')
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('bytes of k/pub.png')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('etag')).toBe(ETAG)
    expect(response.headers.get('content-security-policy')).toContain('sandbox')
  })

  it('answers a matching If-None-Match with 304', async () => {
    const response = await serve('k/pub.png', false, {
      'if-none-match': ETAG,
    })
    expect(response.status).toBe(304)
  })

  it('hides inbox files from visitors', async () => {
    const response = await serve('k/inbox.png')
    expect(response.status).toBe(404)
  })

  it('shows inbox files to the owner without caching them', async () => {
    const response = await serve('k/inbox.png', true)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('does not check the session for published files', async () => {
    const isOwner = vi.fn(() => Promise.resolve(false))
    await serveMedia({
      bucket,
      db,
      isOwner,
      key: 'k/pub.png',
      request: new Request('https://taste.test/media/k/pub.png'),
    })
    expect(isOwner).not.toHaveBeenCalled()
  })

  it('serves nothing for unknown keys or missing objects', async () => {
    expect((await serve('k/unknown.png', true)).status).toBe(404)
    expect((await serve('k/missing.png')).status).toBe(404)
    expect((await serve('')).status).toBe(404)
  })
})
