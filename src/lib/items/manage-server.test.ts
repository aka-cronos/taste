// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import {
  discardInbox,
  getInbox,
  getInboxCount,
  publishInbox,
} from '@/lib/items/inbox-server'
import {
  changeItemVisibility,
  getOwnerItem,
  permanentlyDeleteItem,
  saveItemEdits,
} from '@/lib/items/manage-server'

const { ownerFromHeaders, db, bucket } = vi.hoisted(() => ({
  bucket: { delete: vi.fn() },
  db: { prepare: vi.fn() },
  ownerFromHeaders: vi.fn(),
}))
vi.mock('cloudflare:workers', () => ({ env: { BUCKET: bucket, DB: db } }))
vi.mock('@/lib/auth/request', () => ({ ownerFromHeaders }))
vi.mock('@tanstack/react-start/server', () => ({
  getRequestHeaders: () => new Headers(),
}))

// Run the declared server middleware before validation and the handler.
vi.mock('@tanstack/react-start', () => ({
  createMiddleware: () => ({ server: (middleware: unknown) => middleware }),
  createServerFn: () => {
    let middleware: ((args: {
      next: () => Promise<unknown>
    }) => Promise<unknown>)[] = []
    let validate = (value: unknown): unknown => value
    const builder = {
      handler:
        (handler: (args: { data: unknown }) => unknown) =>
        (args?: { data: unknown }) => {
          const invoke = async (index: number): Promise<unknown> =>
            index < middleware.length
              ? middleware[index]?.({ next: () => invoke(index + 1) })
              : handler({ data: validate(args?.data) })
          return invoke(0)
        },
      middleware: (value: typeof middleware) => {
        middleware = value
        return builder
      },
      validator: (value: typeof validate) => {
        validate = value
        return builder
      },
    }
    return builder
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  ownerFromHeaders.mockResolvedValue(null)
})
it.each([
  ['edit', saveItemEdits],
  ['visibility', changeItemVisibility],
  ['delete', permanentlyDeleteItem],
  ['private detail', getOwnerItem],
  ['inbox list', getInbox],
  ['inbox count', getInboxCount],
  ['inbox publish', publishInbox],
  ['inbox discard', discardInbox],
])('rejects anonymous %s calls before touching storage', async (_, call) => {
  await expect(
    call({ data: { id: 'item', ids: ['item'] } } as never),
  ).rejects.toThrow()
  expect(db.prepare).not.toHaveBeenCalled()
  expect(bucket.delete).not.toHaveBeenCalled()
})
