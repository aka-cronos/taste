// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import {
  getMediaStatus,
  getPublishedItem,
  listPublishedItems,
} from '@/lib/items/repository'
import { createTestD1 } from '@/test/d1'
import { insertItem } from '@/test/items'

let db: D1Database
let sqlite: ReturnType<typeof createTestD1>['sqlite']

beforeEach(() => {
  ;({ db, sqlite } = createTestD1())
})

describe('listPublishedItems', () => {
  it('returns published items only, newest first, with sorted tags', async () => {
    insertItem(sqlite, { createdAt: 1, id: 'old', tags: ['b', 'a'] })
    insertItem(sqlite, { createdAt: 3, id: 'new' })
    insertItem(sqlite, { createdAt: 2, id: 'inbox', status: 'inbox' })

    const page = await listPublishedItems(db, {})
    expect(page.items.map(item => item.id)).toEqual(['new', 'old'])
    expect(page.items[1]?.tags).toEqual(['a', 'b'])
    expect(page.nextCursor).toBeNull()
  })

  it('pages with a cursor without skipping items that share a date', async () => {
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      insertItem(sqlite, { createdAt: 10, id })
    }
    insertItem(sqlite, { createdAt: 10, id: 'f', status: 'inbox' })

    const seen: string[] = []
    let cursor: string | undefined
    do {
      // biome-ignore lint/performance/noAwaitInLoops: each page needs the previous cursor
      const page = await listPublishedItems(db, { cursor, limit: 2 })
      seen.push(...page.items.map(item => item.id))
      cursor = page.nextCursor ?? undefined
    } while (cursor)
    expect(seen).toEqual(['e', 'd', 'c', 'b', 'a'])
  })

  it('maps every item type to its public shape', async () => {
    insertItem(sqlite, {
      contentHash: 'secret-hash',
      creditAuthor: 'Ana',
      id: 'img',
      imageHeight: 600,
      imageKey: 'items/img/a b.png',
      imageWidth: 400,
      sourceUrl: 'https://x.com/ana/status/1',
      type: 'image',
    })
    const [item] = (await listPublishedItems(db, {})).items
    expect(item).toEqual({
      credit: { label: 'Ana', url: 'https://x.com/ana/status/1' },
      description: '',
      id: 'img',
      image: { height: 600, url: '/media/items/img/a%20b.png', width: 400 },
      note: null,
      publishedAt: 1_700_000_000_000,
      sourceUrl: 'https://x.com/ana/status/1',
      tags: [],
      title: null,
      type: 'image',
    })
    expect(JSON.stringify(item)).not.toContain('secret-hash')
  })

  it('drops unsafe source links', async () => {
    insertItem(sqlite, { id: 'a', sourceUrl: 'javascript:alert(1)' })
    const [item] = (await listPublishedItems(db, {})).items
    expect(item?.sourceUrl).toBeNull()
    expect(item?.credit).toBeNull()
  })
})

describe('getPublishedItem', () => {
  it('finds published items and hides inbox ones', async () => {
    insertItem(sqlite, { id: 'pub' })
    insertItem(sqlite, { id: 'inbox', status: 'inbox' })
    expect((await getPublishedItem(db, 'pub'))?.id).toBe('pub')
    expect(await getPublishedItem(db, 'inbox')).toBeNull()
    expect(await getPublishedItem(db, 'missing')).toBeNull()
  })
})

describe('getMediaStatus', () => {
  it('reports the status of the item that owns a key', async () => {
    insertItem(sqlite, { id: 'pub', imageKey: 'k/pub.png', type: 'image' })
    insertItem(sqlite, {
      id: 'inbox',
      imageKey: 'k/inbox.png',
      status: 'inbox',
      type: 'image',
    })
    expect(await getMediaStatus(db, 'k/pub.png')).toBe('published')
    expect(await getMediaStatus(db, 'k/inbox.png')).toBe('inbox')
    expect(await getMediaStatus(db, 'k/none.png')).toBeNull()
  })
})
