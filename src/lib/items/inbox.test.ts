// @vitest-environment node
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { inboxSelectionSchema } from '@/lib/items/edit-input'
import { discardInboxItems, publishInboxItems } from '@/lib/items/manage'
import {
  countInboxItems,
  getPublishedItem,
  listInboxItems,
  listPublishedItems,
  listPublishedTags,
} from '@/lib/items/repository'
import { createTestD1 } from '@/test/d1'
import { insertItem } from '@/test/items'

let db: D1Database
let sqlite: ReturnType<typeof createTestD1>['sqlite']
let objects: Set<string>
let bucket: { delete: Mock<(keys: string | string[]) => Promise<void>> }

beforeEach(() => {
  ;({ db, sqlite } = createTestD1())
  insertItem(sqlite, { id: 'public', tags: ['shared'], title: 'Public' })
  insertItem(sqlite, {
    createdAt: 1,
    description: 'Warm brutalist poster',
    id: 'agent-image',
    origin: 'agent',
    status: 'inbox',
    tags: ['brutalism', 'shared'],
    type: 'image',
  })
  insertItem(sqlite, {
    createdAt: 2,
    id: 'agent-link',
    imageKey: 'covers/agent-link.jpg',
    origin: 'agent',
    sourceUrl: 'https://example.com/post',
    status: 'inbox',
    type: 'link',
  })
  insertItem(sqlite, { createdAt: 3, id: 'hidden-note', status: 'inbox' })
  objects = new Set([
    'items/public.png',
    'items/agent-image.png',
    'covers/agent-link.jpg',
  ])
  bucket = {
    delete: vi.fn((keys: string | string[]) => {
      for (const key of [keys].flat()) {
        objects.delete(key)
      }
      return Promise.resolve()
    }),
  }
})

const ids = (items: { id: string }[]) => items.map(item => item.id)

describe('inbox', () => {
  it('lists only inbox items, newest first, with their origin', async () => {
    const items = await listInboxItems(db)
    expect(ids(items)).toEqual(['hidden-note', 'agent-link', 'agent-image'])
    expect(items[2]).toMatchObject({
      description: 'Warm brutalist poster',
      origin: 'agent',
      tags: ['brutalism', 'shared'],
    })
    expect(items[0]?.origin).toBe('manual')
    expect(await countInboxItems(db)).toBe(3)
    expect(ids((await listPublishedItems(db, {})).items)).toEqual(['public'])
    expect(await listPublishedTags(db)).toEqual(['shared'])
  })

  it('publishes selected items into the public gallery and search', async () => {
    expect(
      await publishInboxItems(db, ['agent-image', 'agent-link', 'public']),
    ).toBe(2)
    expect(ids(await listInboxItems(db))).toEqual(['hidden-note'])
    expect(await countInboxItems(db)).toBe(1)
    expect(await getPublishedItem(db, 'agent-image')).toMatchObject({
      id: 'agent-image',
    })
    expect(
      ids((await listPublishedItems(db, { q: 'brutalist' })).items),
    ).toEqual(['agent-image'])
    expect(await listPublishedTags(db)).toEqual(['brutalism', 'shared'])
  })

  it('discards selected items with their tags, index and stored files', async () => {
    expect(
      await discardInboxItems({ bucket, db }, [
        'agent-image',
        'agent-link',
        'hidden-note',
        'missing',
      ]),
    ).toBe(3)
    expect([...objects]).toEqual(['items/public.png'])
    expect(bucket.delete).toHaveBeenCalledOnce()
    expect(await countInboxItems(db)).toBe(0)
    for (const table of ['items', 'item_tags', 'items_fts']) {
      const column = table === 'items' ? 'id' : 'item_id'
      expect(
        sqlite
          .prepare(`SELECT count(*) AS n FROM ${table} WHERE ${column} <> ?`)
          .get('public'),
      ).toEqual({ n: 0 })
    }
  })

  it('never discards a published item', async () => {
    expect(await discardInboxItems({ bucket, db }, ['public'])).toBe(0)
    expect(bucket.delete).not.toHaveBeenCalled()
    expect(await getPublishedItem(db, 'public')).not.toBeNull()
  })

  it('keeps discarded rows for retry when R2 fails', async () => {
    bucket.delete.mockRejectedValueOnce(new Error('R2 unavailable'))
    await expect(
      discardInboxItems({ bucket, db }, ['agent-image']),
    ).rejects.toThrow('R2 unavailable')
    expect(await countInboxItems(db)).toBe(3)
    await discardInboxItems({ bucket, db }, ['agent-image'])
    expect(await countInboxItems(db)).toBe(2)
  })

  it('validates and deduplicates a selection', () => {
    expect(inboxSelectionSchema.parse({ ids: ['a', 'a', 'b'] })).toEqual({
      ids: ['a', 'b'],
    })
    expect(inboxSelectionSchema.safeParse({ ids: [] }).success).toBe(false)
    expect(
      inboxSelectionSchema.safeParse({
        ids: Array.from({ length: 101 }, (_, i) => `${i}`),
      }).success,
    ).toBe(false)
  })
})
