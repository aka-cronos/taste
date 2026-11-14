// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { discardInboxItems } from '@/lib/items/manage'
import { listInboxItems } from '@/lib/items/repository'
import {
  saveItemSchema,
  saveMcpItem,
  updateItemSchema,
  updateMcpItem,
} from '@/lib/mcp/write'
import { createTestD1 } from '@/test/d1'
import { insertItem } from '@/test/items'

vi.mock('@/lib/items/link-metadata', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/items/link-metadata')>()),
  fetchLinkMetadata: vi.fn().mockResolvedValue({
    description: 'Fetched',
    image: undefined,
    title: 'Post',
  }),
}))

const bucket = {
  delete: vi.fn().mockResolvedValue(undefined),
  put: vi.fn().mockResolvedValue({}),
}

describe('MCP writes', () => {
  it('saves posts with supplied description and credit and rejects discarded sources', async () => {
    const { db } = createTestD1()
    const input = saveItemSchema.parse({
      creditAuthor: 'Artist',
      description: 'Agent description',
      sourceUrl: 'https://example.com/post',
      tags: ['POST'],
      type: 'link',
    })
    const saved = await saveMcpItem({ bucket, db }, input)
    expect(saved.item).toMatchObject({
      credit: { label: 'Artist' },
      description: 'Agent description',
      origin: 'agent',
      status: 'inbox',
      title: 'Post',
      type: 'link',
    })
    expect(await listInboxItems(db)).toHaveLength(1)
    await discardInboxItems({ bucket, db }, [saved.item?.id ?? ''])
    await expect(saveMcpItem({ bucket, db }, input)).rejects.toThrow()
    expect(await listInboxItems(db)).toHaveLength(0)
  })

  it('keeps published duplicates published and preserves metadata until explicitly edited', async () => {
    const { db, sqlite } = createTestD1()
    insertItem(sqlite, {
      id: 'published',
      sourceUrl: 'https://example.com/post',
      tags: ['original'],
      title: 'Original',
    })
    const input = saveItemSchema.parse({
      description: 'New',
      sourceUrl: 'https://example.com/post',
      tags: ['new'],
      type: 'link',
    })
    const saved = await saveMcpItem({ bucket, db }, input)
    expect(saved).toMatchObject({
      duplicate: true,
      item: {
        id: 'published',
        origin: 'manual',
        status: 'published',
        tags: ['new', 'original'],
        title: 'Original',
      },
    })
    const updated = await updateMcpItem(
      db,
      updateItemSchema.parse({ id: 'published', note: 'Updated' }),
    )
    expect(updated).toMatchObject({
      note: 'Updated',
      origin: 'manual',
      status: 'published',
      tags: ['new', 'original'],
      title: 'Original',
    })
    expect(await listInboxItems(db)).toHaveLength(0)
  })

  it('keeps note citations separate from URL-based ingest identity', async () => {
    const { db, sqlite } = createTestD1()
    const sourceUrl = 'https://example.com/post'
    insertItem(sqlite, { id: 'published', sourceUrl, tags: ['original'] })
    const note = {
      description: 'A note',
      note: 'My own observation',
      tags: ['note'],
      type: 'note',
    }
    const invalid = saveItemSchema.safeParse({ ...note, sourceUrl })
    expect(invalid.success).toBe(false)
    if (!invalid.success) {
      expect(invalid.error.issues[0]?.message).toContain('Use creditUrl')
    }
    const saved = await saveMcpItem(
      { bucket, db },
      saveItemSchema.parse({ ...note, creditUrl: sourceUrl }),
    )
    expect(saved).toMatchObject({
      duplicate: false,
      item: {
        credit: { url: sourceUrl },
        note: 'My own observation',
        sourceUrl: null,
        type: 'note',
      },
    })
    const link = await saveMcpItem(
      { bucket, db },
      saveItemSchema.parse({ description: 'Post', sourceUrl, type: 'link' }),
    )
    expect(link).toMatchObject({
      duplicate: true,
      item: { id: 'published', tags: ['original'] },
    })
    const otherUrl = 'https://example.com/other'
    await saveMcpItem(
      { bucket, db },
      saveItemSchema.parse({ ...note, creditUrl: otherUrl }),
    )
    const otherLink = await saveMcpItem(
      { bucket, db },
      saveItemSchema.parse({
        description: 'Other post',
        sourceUrl: otherUrl,
        type: 'link',
      }),
    )
    expect(otherLink).toMatchObject({
      duplicate: false,
      item: { sourceUrl: otherUrl, type: 'link' },
    })
  })

  it('requires exactly one image source, its MIME type for base64, and bounds inputs', () => {
    const base = { description: 'Reference', type: 'image' }
    for (const extra of [
      {},
      { imageBase64: 'AAAA' },
      { imageBase64: 'AAAA', imageUrl: 'https://example.com/x' },
      { imageBase64: 'A'.repeat(4 * Math.ceil((10 * 1024 * 1024) / 3) + 4) },
      { creditUrl: 'javascript:alert(1)', imageUrl: 'https://example.com/x' },
    ]) {
      expect(saveItemSchema.safeParse({ ...base, ...extra }).success).toBe(
        false,
      )
    }
  })
})
