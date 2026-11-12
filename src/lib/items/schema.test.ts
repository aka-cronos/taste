// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestD1 } from '@/test/d1'
import { insertItem, tagItem } from '@/test/items'

const CHECK_FAILED = /CHECK/u
const UNIQUE_FAILED = /UNIQUE/u

let sqlite: ReturnType<typeof createTestD1>['sqlite']

beforeEach(() => {
  ;({ sqlite } = createTestD1())
})

function search(query: string) {
  return sqlite
    .prepare(
      'SELECT item_id FROM items_fts WHERE items_fts MATCH ? ORDER BY item_id',
    )
    .all(query)
    .map(row => row.item_id)
}

describe('items schema', () => {
  it('indexes title, description and note', () => {
    insertItem(sqlite, {
      description: 'Concrete housing block',
      id: 'a',
      note: 'Seen in Belgrade',
      title: 'Brutalist poster',
    })
    expect(search('brutalist')).toEqual(['a'])
    expect(search('concrete')).toEqual(['a'])
    expect(search('belgrade')).toEqual(['a'])
  })

  it('ignores diacritics', () => {
    insertItem(sqlite, { description: 'Café typography', id: 'a' })
    expect(search('cafe')).toEqual(['a'])
  })

  it('keeps the index in sync with item edits', () => {
    insertItem(sqlite, { description: 'warm palette', id: 'a' })
    sqlite.prepare("UPDATE items SET description = 'cold' WHERE id = 'a'").run()
    expect(search('warm')).toEqual([])
    expect(search('cold')).toEqual(['a'])
  })

  it('indexes tag names as tags are added, removed and renamed', () => {
    insertItem(sqlite, { id: 'a', tags: ['Posters'] })
    insertItem(sqlite, { id: 'b' })
    tagItem(sqlite, 'b', 'posters')
    expect(search('tags:posters')).toEqual(['a', 'b'])

    sqlite.prepare("DELETE FROM item_tags WHERE item_id = 'a'").run()
    expect(search('tags:posters')).toEqual(['b'])

    sqlite
      .prepare("UPDATE tags SET name = 'Print' WHERE name = 'Posters'")
      .run()
    expect(search('tags:posters')).toEqual([])
    expect(search('tags:print')).toEqual(['b'])
  })

  it('removes a deleted item, its tag links and its index row', () => {
    insertItem(sqlite, { description: 'gone', id: 'a', tags: ['x'] })
    sqlite.prepare("DELETE FROM items WHERE id = 'a'").run()
    expect(search('gone')).toEqual([])
    expect(sqlite.prepare('SELECT count(*) AS n FROM item_tags').get()).toEqual(
      { n: 0 },
    )
  })

  it('keeps tags unique per normalized name', () => {
    insertItem(sqlite, { id: 'a', tags: ['Warm  Tones'] })
    insertItem(sqlite, { id: 'b', tags: [' warm tones'] })
    expect(sqlite.prepare('SELECT name FROM tags').all()).toEqual([
      { name: 'Warm  Tones' },
    ])
    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO tags (name, normalized_name) VALUES ('WARM TONES', 'warm tones')",
        )
        .run(),
    ).toThrow(UNIQUE_FAILED)
  })

  it('rejects unknown types and statuses, and published items without a date', () => {
    expect(() =>
      insertItem(sqlite, { id: 'a', type: 'video' as never }),
    ).toThrow(CHECK_FAILED)
    expect(() =>
      insertItem(sqlite, { id: 'b', status: 'draft' as never }),
    ).toThrow(CHECK_FAILED)
    expect(() => insertItem(sqlite, { id: 'c', publishedAt: null })).toThrow(
      CHECK_FAILED,
    )
  })

  it('requires a stored file for image items', () => {
    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO items (id, type, origin, status, created_at, updated_at)
           VALUES ('a', 'image', 'manual', 'inbox', 1, 1)`,
        )
        .run(),
    ).toThrow(CHECK_FAILED)
  })
})
