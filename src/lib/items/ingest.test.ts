// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  countDiscards,
  DiscardedSourceError,
  forgetDiscard,
  listDiscards,
} from '@/lib/items/discards'
import { type IngestInput, ingestItem } from '@/lib/items/ingest'
import { fetchLinkMetadata } from '@/lib/items/link-metadata'
import { discardInboxItems } from '@/lib/items/manage'
import {
  countInboxItems,
  getPublishedItem,
  listPublishedItems,
} from '@/lib/items/repository'
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

  it.each([
    'https://www.youtube.com/watch?v=kPr2ZfWJlbE',
    'https://youtu.be/kPr2ZfWJlbE',
  ])(
    'publishes a YouTube link with tags when metadata is unavailable: %s',
    async sourceUrl => {
      vi.mocked(fetchLinkMetadata).mockResolvedValue({
        description: '',
        image: undefined,
        title: null,
      })
      const result = await save({ sourceUrl, tags: ['music'], type: 'link' })
      expect(await getPublishedItem(db, result.item.id)).toMatchObject({
        sourceUrl,
        tags: ['music'],
        title: null,
        type: 'link',
      })
      expect(bucket.put).not.toHaveBeenCalled()
    },
  )

  it('keeps distinct links with the same cover and their tags separate', async () => {
    const first = await save({
      sourceUrl: 'https://example.com/one',
      tags: ['one'],
      type: 'link',
    })
    const second = await save({
      sourceUrl: 'https://example.com/two',
      tags: ['two'],
      type: 'link',
    })
    expect(second.duplicate).toBe(false)
    expect(second.item.id).not.toBe(first.item.id)
    expect(second.item.source_url).toBe('https://example.com/two')
    expect((await getPublishedItem(db, first.item.id))?.tags).toEqual(['one'])
    expect((await getPublishedItem(db, second.item.id))?.tags).toEqual(['two'])
    expect((await listPublishedItems(db, {})).items).toHaveLength(2)
    expect(bucket.put).toHaveBeenCalledTimes(2)
    expect(bucket.delete).not.toHaveBeenCalled()
  })

  it.each(['image-first', 'link-first'])(
    'keeps an original image distinct from a matching link cover: %s',
    async order => {
      const imageInput: Partial<IngestInput> = {
        image: png,
        tags: ['original'],
        type: 'image',
      }
      const linkInput: Partial<IngestInput> = {
        sourceUrl: 'https://example.com/page',
        tags: ['page'],
        type: 'link',
      }
      const inputs =
        order === 'image-first'
          ? [imageInput, linkInput]
          : [linkInput, imageInput]
      const first = await save(inputs[0])
      const second = await save(inputs[1])
      expect(second.duplicate).toBe(false)
      expect(second.item.id).not.toBe(first.item.id)
      const imageDuplicate = await save(imageInput)
      expect(imageDuplicate.duplicate).toBe(true)
      expect(imageDuplicate.item.type).toBe('image')
      expect(imageDuplicate.item.tags).toEqual(['original'])
      expect((await listPublishedItems(db, {})).items).toHaveLength(2)
    },
  )

  it('keeps concurrent saves of distinct URLs with matching covers separate', async () => {
    const results = await Promise.all([
      save({ sourceUrl: 'https://example.com/one', type: 'link' }),
      save({ sourceUrl: 'https://example.com/two', type: 'link' }),
    ])
    expect(results.every(result => !result.duplicate)).toBe(true)
    expect(results[0]?.item.id).not.toBe(results[1]?.item.id)
    expect((await listPublishedItems(db, {})).items).toHaveLength(2)
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

describe('ingesting discarded sources', () => {
  const agent: Partial<IngestInput> = {
    description: 'Saved by an agent',
    origin: 'agent',
    status: 'inbox',
  }
  const discard = async (input: Partial<IngestInput>) => {
    const saved = await save({ ...agent, ...input })
    await discardInboxItems({ bucket: bucket as unknown as R2Bucket, db }, [
      saved.item.id,
    ])
    vi.clearAllMocks()
  }

  it('refuses an agent save of a discarded source URL before fetching it', async () => {
    await discard({ sourceUrl: 'https://example.com/post', type: 'link' })
    const attempt = save({
      ...agent,
      sourceUrl: 'https://example.com/post#again',
      type: 'link',
    })
    await expect(attempt).rejects.toBeInstanceOf(DiscardedSourceError)
    await expect(attempt).rejects.toThrow('The owner discarded this before')
    expect(fetchLinkMetadata).not.toHaveBeenCalled()
    expect(bucket.put).not.toHaveBeenCalled()
    expect(await countInboxItems(db)).toBe(0)
    expect(await countDiscards(db)).toBe(1)
  })

  it('refuses an agent save of a discarded image, even from another URL', async () => {
    await discard({ image: png, type: 'image' })
    await expect(
      save({
        ...agent,
        image: png,
        sourceUrl: 'https://cdn.example.com/copy.png',
        type: 'image',
      }),
    ).rejects.toBeInstanceOf(DiscardedSourceError)
    expect(bucket.put).not.toHaveBeenCalled()
    expect(await countInboxItems(db)).toBe(0)
  })

  it('saves a discarded source the owner adds by hand and forgets the discard', async () => {
    await discard({
      image: png,
      sourceUrl: 'https://example.com/a',
      type: 'image',
    })
    const manual = await save({ image: png, type: 'image' })
    expect(manual.duplicate).toBe(false)
    expect(await getPublishedItem(db, manual.item.id)).not.toBeNull()
    expect(await listDiscards(db)).toEqual([])
  })

  it('lets agents save a source again once its discard is forgotten', async () => {
    await discard({ sourceUrl: 'https://example.com/post', type: 'link' })
    const [entry] = await listDiscards(db)
    await forgetDiscard(db, entry?.id ?? 0)
    const again = await save({
      ...agent,
      sourceUrl: 'https://example.com/post',
      type: 'link',
    })
    expect(again.duplicate).toBe(false)
    expect(await countInboxItems(db)).toBe(1)
  })
})
