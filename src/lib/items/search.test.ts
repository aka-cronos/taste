// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listPublishedItems, listPublishedTags } from '@/lib/items/repository'
import {
  galleryFiltersSchema,
  normalizeGalleryFilters,
} from '@/lib/items/search'
import { createTestD1 } from '@/test/d1'
import { insertItem, tagItem } from '@/test/items'

let db: D1Database
let sqlite: ReturnType<typeof createTestD1>['sqlite']
beforeEach(() => {
  ;({ db, sqlite } = createTestD1())
})
afterEach(() => sqlite.close())

const ids = async (filters: Parameters<typeof listPublishedItems>[1]) =>
  (await listPublishedItems(db, filters)).items.map(item => item.id)

describe('gallery search', () => {
  it.each(['title', 'description', 'note', 'tags'] as const)(
    'searches %s through FTS5',
    async field => {
      insertItem(sqlite, {
        id: 'match',
        [field]: field === 'tags' ? ['Cerámica'] : 'Cerámica',
      })
      insertItem(sqlite, { id: 'other' })
      insertItem(sqlite, { id: 'private', status: 'inbox', title: 'ceramica' })
      expect(await ids({ q: 'CERAMICA' })).toEqual(['match'])
    },
  )

  it('requires every word, even across different fields', async () => {
    insertItem(sqlite, { id: 'both', tags: ['poster'], title: 'warm' })
    insertItem(sqlite, { id: 'one', title: 'warm' })
    expect(await ids({ q: 'warm poster' })).toEqual(['both'])
  })

  it('combines text, all selected tags and type, preserving filters across pages', async () => {
    for (const id of ['a', 'b', 'c']) {
      insertItem(sqlite, {
        id,
        tags: ['Poster', 'red'],
        title: 'warm',
        type: 'image',
      })
    }
    insertItem(sqlite, {
      id: 'wrong-type',
      tags: ['poster', 'red'],
      title: 'warm',
    })
    insertItem(sqlite, {
      id: 'one-tag',
      tags: ['poster'],
      title: 'warm',
      type: 'image',
    })
    insertItem(sqlite, {
      id: 'wrong-text',
      tags: ['poster', 'red'],
      type: 'image',
    })
    const filters = {
      limit: 2,
      q: 'warm',
      tags: [' POSTER ', 'red', 'poster'],
      type: 'image' as const,
    }
    const first = await listPublishedItems(db, filters)
    expect(first.items.map(item => item.id)).toEqual(['c', 'b'])
    const second = await listPublishedItems(db, {
      ...filters,
      cursor: first.nextCursor ?? undefined,
    })
    expect(second.items.map(item => item.id)).toEqual(['a'])
    expect(second.nextCursor).toBeNull()
    expect(await ids({ tags: ['missing'] })).toEqual([])
  })

  it('treats quotes, FTS operators and punctuation safely as plain input', async () => {
    insertItem(sqlite, { id: 'match', title: 'warm poster' })
    expect(await ids({ q: '"warm" (poster)*' })).toEqual(['match'])
    expect(await ids({ q: 'warm OR missing' })).toEqual([])
    expect(await ids({ q: '" : * ---' })).toEqual([])
    expect(await ids({ q: "'; DROP TABLE items; --" })).toEqual([])
    expect(await ids({ q: '   ' })).toEqual(['match'])
  })

  it('follows index updates to text and tags', async () => {
    insertItem(sqlite, { id: 'a', title: 'before' })
    sqlite.prepare('UPDATE items SET title = ? WHERE id = ?').run('after', 'a')
    expect(await ids({ q: 'before' })).toEqual([])
    expect(await ids({ q: 'after' })).toEqual(['a'])
    tagItem(sqlite, 'a', 'poster')
    expect(await ids({ q: 'poster' })).toEqual(['a'])
    sqlite
      .prepare('UPDATE tags SET name = ?, normalized_name = ?')
      .run('print', 'print')
    expect(await ids({ q: 'poster' })).toEqual([])
    expect(await ids({ q: 'print' })).toEqual(['a'])
    sqlite.prepare('DELETE FROM item_tags WHERE item_id = ?').run('a')
    expect(await ids({ q: 'print' })).toEqual([])
  })

  it('lists public tags only, normalized and unique', async () => {
    insertItem(sqlite, { id: 'a', tags: ['Warm', 'poster'] })
    insertItem(sqlite, { id: 'b', tags: ['warm'] })
    insertItem(sqlite, { id: 'secret', status: 'inbox', tags: ['private'] })
    expect(await listPublishedTags(db)).toEqual(['poster', 'warm'])
  })
})

describe('normalizeGalleryFilters', () => {
  it('uses the same canonical filters for URLs and server input', () => {
    expect(
      normalizeGalleryFilters({
        q: ' warm ',
        tags: [' POSTER ', 'poster', '  Red   blue ', 5],
        type: 'image',
      }),
    ).toEqual({ q: 'warm', tags: ['poster', 'red blue'], type: 'image' })
    expect(normalizeGalleryFilters({ tags: 'Warm' })).toEqual({
      tags: ['warm'],
    })
    expect(
      normalizeGalleryFilters({ q: 1, tags: {}, type: 'invalid' }),
    ).toEqual({})
    expect(normalizeGalleryFilters(null)).toEqual({})
  })
})

describe('galleryFiltersSchema', () => {
  it.each([
    undefined,
    null,
    [],
    'invalid',
    { q: 42, tags: {}, type: 'video', unknown: 'ignored' },
    { q: '   ', tags: ['', '  ', null, 42], type: ['image'] },
  ])('drops malformed or empty filters from %j', input => {
    expect(galleryFiltersSchema.parse(input)).toEqual({})
  })

  it('preserves valid filters alongside invalid values and drops unknown keys', () => {
    expect(
      galleryFiltersSchema.parse({
        q: ' warm ',
        tags: [' ＷＡＲＭ ', null, 'warm', '', ' Poster '],
        type: 'invalid',
        unknown: 'ignored',
      }),
    ).toEqual({ q: 'warm', tags: ['poster', 'warm'] })
  })
})
