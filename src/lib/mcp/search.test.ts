// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  getMcpItem,
  listOwnerTagCounts,
  listPublishedItems,
  searchOwnerItems,
} from '@/lib/items/repository'
import { createTestD1 } from '@/test/d1'
import { insertItem } from '@/test/items'

describe('MCP owner reads', () => {
  it('paginates both statuses at equal timestamps without affecting public reads', async () => {
    const { db, sqlite } = createTestD1()
    insertItem(sqlite, { id: 'a', status: 'inbox', tags: ['private'] })
    insertItem(sqlite, { id: 'b', tags: ['shared'] })
    insertItem(sqlite, { id: 'c', status: 'inbox', tags: ['shared'] })
    const first = await searchOwnerItems(db, { limit: 2 })
    expect(first.items.map(item => item.id)).toEqual(['c', 'b'])
    expect(first.items.map(item => item.status)).toEqual(['inbox', 'published'])
    const second = await searchOwnerItems(db, {
      cursor: first.nextCursor ?? '',
      limit: 2,
    })
    expect(second.items.map(item => item.id)).toEqual(['a'])
    expect(second.nextCursor).toBeNull()
    expect(
      (await listPublishedItems(db, {})).items.map(item => item.id),
    ).toEqual(['b'])
    expect(await listOwnerTagCounts(db)).toEqual([
      { count: 1, name: 'private' },
      { count: 2, name: 'shared' },
    ])
    expect(await getMcpItem(db, 'missing')).toBeNull()
  })
  it('combines FTS, all tags, type and status', async () => {
    const { db, sqlite } = createTestD1()
    for (const [id, status, tags] of [
      ['match', 'inbox', ['warm', 'poster']],
      ['public', 'published', ['warm', 'poster']],
      ['one-tag', 'inbox', ['warm']],
    ] as const) {
      insertItem(sqlite, {
        description: 'Brutalist reference',
        id,
        status,
        tags: [...tags],
        type: 'image',
      })
    }
    const result = await searchOwnerItems(db, {
      q: 'brutalist',
      status: 'inbox',
      tags: ['WARM', 'poster'],
      type: 'image',
    })
    expect(result.items.map(item => item.id)).toEqual(['match'])
  })
})
