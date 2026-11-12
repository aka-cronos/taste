// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { editItemSchema } from '@/lib/items/edit-input'
import {
  deleteItem,
  getItemEditor,
  listOwnerTags,
  setItemVisibility,
  updateItem,
} from '@/lib/items/manage'
import {
  getOwnerGalleryItem,
  getPublishedItem,
  listPublishedItems,
  listPublishedTags,
} from '@/lib/items/repository'
import { createTestD1 } from '@/test/d1'
import { insertItem } from '@/test/items'

let db: D1Database
let sqlite: ReturnType<typeof createTestD1>['sqlite']
beforeEach(() => {
  ;({ db, sqlite } = createTestD1())
  insertItem(sqlite, {
    creditAuthor: 'Original',
    id: 'item',
    note: 'Old note',
    tags: ['old'],
    title: 'Old title',
    type: 'image',
  })
})

describe('item management', () => {
  it('replaces text and tags in the gallery and FTS immediately', async () => {
    const input = editItemSchema.parse({
      creditAuthor: 'New author',
      creditUrl: 'https://example.com/author',
      description: 'Cerulean design',
      id: 'item',
      note: 'New commentary',
      tags: [' Poster ', 'POSTER', 'minimal'],
      title: 'Revised title',
    })
    await updateItem(db, input)
    expect(await getItemEditor(db, 'item')).toMatchObject({
      ...input,
      status: 'published',
      tags: ['minimal', 'poster'],
    })
    expect(await getPublishedItem(db, 'item')).toMatchObject({
      credit: { label: 'New author', url: 'https://example.com/author' },
      tags: ['minimal', 'poster'],
    })
    const matches = await Promise.all(
      ['cerulean', 'commentary', 'revised', 'poster'].map(q =>
        listPublishedItems(db, { q }),
      ),
    )
    for (const page of matches) {
      expect(page.items.map(item => item.id)).toEqual(['item'])
    }
    expect((await listPublishedItems(db, { q: 'old' })).items).toEqual([])
    expect(await listPublishedTags(db)).toEqual(['minimal', 'poster'])
    await updateItem(db, { ...input, tags: [] })
    expect((await listPublishedItems(db, { q: 'poster' })).items).toEqual([])
  })

  it('hides an item from public reads, retaining owner access and tag suggestions', async () => {
    await setItemVisibility(db, 'item', 'inbox')
    expect(await getPublishedItem(db, 'item')).toBeNull()
    expect((await listPublishedItems(db, {})).items).toEqual([])
    expect(await listPublishedTags(db)).toEqual([])
    expect(await getOwnerGalleryItem(db, 'item')).toMatchObject({ id: 'item' })
    expect(await listOwnerTags(db)).toContain('old')
    await setItemVisibility(db, 'item', 'published')
    expect(await getPublishedItem(db, 'item')).toMatchObject({ id: 'item' })
  })

  it('publishes an inbox item that has never been published', async () => {
    insertItem(sqlite, { id: 'inbox', status: 'inbox' })
    await setItemVisibility(db, 'inbox', 'published')
    expect((await getPublishedItem(db, 'inbox'))?.publishedAt).toBeGreaterThan(
      0,
    )
  })

  it.each(['image', 'link', 'note'] as const)(
    'permanently removes a %s, including its stored file and index',
    async type => {
      const id = `delete-${type}`
      const key = type === 'note' ? null : `items/${id}`
      insertItem(sqlite, { id, imageKey: key, tags: ['delete'], type })
      const objects = new Set(key ? [key] : [])
      const bucket = {
        delete: vi.fn((objectKey: string | string[]) => {
          for (const entry of [objectKey].flat()) {
            objects.delete(entry)
          }
          return Promise.resolve()
        }),
      }
      await deleteItem({ bucket, db }, id)
      expect(objects.size).toBe(0)
      expect(bucket.delete).toHaveBeenCalledTimes(key ? 1 : 0)
      expect(
        sqlite.prepare('SELECT * FROM items WHERE id = ?').get(id),
      ).toBeUndefined()
      expect(
        sqlite.prepare('SELECT * FROM item_tags WHERE item_id = ?').get(id),
      ).toBeUndefined()
      expect(
        sqlite.prepare('SELECT * FROM items_fts WHERE item_id = ?').get(id),
      ).toBeUndefined()
      await deleteItem({ bucket, db }, id)
      expect(bucket.delete).toHaveBeenCalledTimes(key ? 1 : 0)
    },
  )

  it('keeps the row and its file key for retry when R2 fails', async () => {
    const bucket = {
      delete: vi
        .fn()
        .mockRejectedValueOnce(new Error('R2 unavailable'))
        .mockResolvedValue(undefined),
    }
    await expect(deleteItem({ bucket, db }, 'item')).rejects.toThrow(
      'R2 unavailable',
    )
    expect(await getItemEditor(db, 'item')).not.toBeNull()
    await deleteItem({ bucket, db }, 'item')
    expect(await getItemEditor(db, 'item')).toBeNull()
  })

  it('rejects unsafe credit URLs, oversized tags and invalid payloads', () => {
    const valid = {
      creditAuthor: '',
      creditUrl: '',
      description: '',
      id: 'item',
      note: '',
      tags: [],
      title: '',
    }
    expect(
      editItemSchema.safeParse({ ...valid, creditUrl: 'javascript:alert(1)' })
        .success,
    ).toBe(false)
    expect(
      editItemSchema.safeParse({ ...valid, tags: ['x'.repeat(101)] }).success,
    ).toBe(false)
    expect(editItemSchema.safeParse({ ...valid, title: null }).success).toBe(
      false,
    )
  })
})
