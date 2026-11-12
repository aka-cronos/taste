// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type IngestInput, ingestItem } from '@/lib/items/ingest'
import { fetchLinkMetadata } from '@/lib/items/link-metadata'
import { getPublishedItem, listPublishedItems } from '@/lib/items/repository'
import { createTestD1 } from '@/test/d1'

vi.mock('@/lib/items/link-metadata', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/items/link-metadata')>()),
  fetchLinkMetadata: vi.fn(),
}))
const MEDIA_PATH = /^\/media\/items\//u
const png = {
  bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]),
  contentType: 'image/png',
}
const base: IngestInput = {
  note: 'A reference',
  origin: 'manual',
  status: 'published',
  type: 'note',
}
let db: D1Database
const bucket = {
  delete: vi.fn().mockResolvedValue(undefined),
  put: vi.fn().mockResolvedValue({}),
}

beforeEach(() => {
  ;({ db } = createTestD1())
  vi.clearAllMocks()
  vi.mocked(fetchLinkMetadata).mockResolvedValue({
    description: 'A thumbnail',
    image: png,
    title: 'A film',
  })
})
const save = (input: Partial<IngestInput> = {}) =>
  ingestItem(
    { bucket: bucket as unknown as R2Bucket, db },
    { ...base, ...input },
  )

describe('ingestItem', () => {
  it('publishes manual notes with description, note and normalized tags', async () => {
    const result = await save({
      description: 'Warm',
      tags: [' Poster ', 'POSTER', 'warm'],
    })
    expect(result.duplicate).toBe(false)
    expect(await getPublishedItem(db, result.item.id)).toMatchObject({
      description: 'Warm',
      note: 'A reference',
      tags: ['poster', 'warm'],
      type: 'note',
    })
    expect(bucket.put).not.toHaveBeenCalled()
  })

  it('deduplicates original image bytes and merges normalized tags', async () => {
    const first = await save({ image: png, tags: ['Original'], type: 'image' })
    const second = await save({
      image: png,
      tags: [' NEW ', 'original', 'new'],
      type: 'image',
    })
    expect(second).toMatchObject({
      duplicate: true,
      item: { id: first.item.id, tags: ['new', 'original'] },
    })
    expect((await listPublishedItems(db, {})).items).toHaveLength(1)
    expect(bucket.put).toHaveBeenCalledWith(expect.any(String), png.bytes, {
      httpMetadata: { contentType: 'image/png' },
    })
    expect(bucket.delete).toHaveBeenCalledTimes(1)
    expect((await listPublishedItems(db, { q: 'new' })).items).toHaveLength(1)
  })

  it('stores link metadata and a video thumbnail as a link, never a video', async () => {
    const result = await save({
      sourceUrl: 'https://video.example/watch?v=1',
      type: 'link',
    })
    expect(await getPublishedItem(db, result.item.id)).toMatchObject({
      description: 'A thumbnail',
      image: { url: expect.stringMatching(MEDIA_PATH) },
      title: 'A film',
      type: 'link',
    })
  })

  it('deduplicates source URLs before fetching metadata again', async () => {
    const first = await save({
      sourceUrl: 'https://example.com/post#top',
      tags: ['one'],
      type: 'link',
    })
    const second = await save({
      sourceUrl: 'https://example.com/post#other',
      tags: ['two'],
      type: 'link',
    })
    expect(second).toMatchObject({
      duplicate: true,
      item: { id: first.item.id, tags: ['one', 'two'] },
    })
    expect(fetchLinkMetadata).toHaveBeenCalledTimes(1)
  })

  it('handles concurrent source URL duplicates even without cover images', async () => {
    vi.mocked(fetchLinkMetadata).mockResolvedValue({
      description: '',
      image: undefined,
      title: 'Page',
    })
    const results = await Promise.all([
      save({ sourceUrl: 'https://example.com/', tags: ['one'], type: 'link' }),
      save({ sourceUrl: 'https://example.com/', tags: ['two'], type: 'link' }),
    ])
    expect(results[0]?.item.id).toBe(results[1]?.item.id)
    expect((await listPublishedItems(db, {})).items).toHaveLength(1)
    expect((await listPublishedItems(db, {})).items[0]?.tags).toEqual([
      'one',
      'two',
    ])
  })

  it('preserves existing content and inbox status on a duplicate', async () => {
    const first = await save({
      description: 'Original',
      image: png,
      origin: 'agent',
      status: 'inbox',
      type: 'image',
    })
    const second = await save({
      description: 'Replacement',
      image: png,
      tags: ['new'],
      type: 'image',
    })
    expect(second.item).toMatchObject({
      description: 'Original',
      id: first.item.id,
      status: 'inbox',
      tags: ['new'],
    })
    expect(await getPublishedItem(db, first.item.id)).toBeNull()
  })

  it('rejects invalid input before writing to R2 or D1', async () => {
    await expect(save({ note: ' ' })).rejects.toThrow('Write a note')
    await expect(
      save({
        image: { bytes: new Uint8Array([1]), contentType: 'image/png' },
        type: 'image',
      }),
    ).rejects.toThrow('Choose a PNG')
    await expect(
      save({ tags: Array.from({ length: 51 }, () => 'x') }),
    ).rejects.toThrow('50 tags')
    await expect(
      save({ sourceUrl: 'http://127.0.0.1/', type: 'link' }),
    ).rejects.toThrow('public')
    expect(bucket.put).not.toHaveBeenCalled()
  })

  it('cleans up an uploaded image if the database fails', async () => {
    const brokenDb = {
      batch: vi.fn().mockRejectedValue(new Error('Database unavailable')),
      prepare: db.prepare.bind(db),
    }
    await expect(
      ingestItem(
        {
          bucket: bucket as unknown as R2Bucket,
          db: brokenDb as unknown as D1Database,
        },
        { ...base, image: png, type: 'image' },
      ),
    ).rejects.toThrow('Database unavailable')
    expect(bucket.delete).toHaveBeenCalledTimes(1)
  })
})
