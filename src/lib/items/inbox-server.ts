import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { requireOwner } from '@/lib/auth/session'
import { forgetDiscard, listDiscards } from '@/lib/items/discards'
import { discardIdSchema, inboxSelectionSchema } from '@/lib/items/edit-input'
import {
  deleteInboxItems,
  discardInboxItems,
  publishInboxItems,
} from '@/lib/items/manage'
import { countInboxItems, listInboxItems } from '@/lib/items/repository'

/** The inbox items to review and how many wait in total. */
export const getInbox = createServerFn({ method: 'GET' })
  .middleware([requireOwner])
  .handler(async () => {
    const [items, count] = await Promise.all([
      listInboxItems(env.DB),
      countInboxItems(env.DB),
    ])
    return { count, items }
  })

/** How many items wait in the inbox, for the header badge. */
export const getInboxCount = createServerFn({ method: 'GET' })
  .middleware([requireOwner])
  .handler(() => countInboxItems(env.DB))

export const publishInbox = createServerFn({ method: 'POST' })
  .middleware([requireOwner])
  .validator((input: unknown) => inboxSelectionSchema.parse(input))
  .handler(({ data }) => publishInboxItems(env.DB, data.ids))

export const discardInbox = createServerFn({ method: 'POST' })
  .middleware([requireOwner])
  .validator((input: unknown) => inboxSelectionSchema.parse(input))
  .handler(({ data }) =>
    discardInboxItems({ bucket: env.BUCKET, db: env.DB }, data.ids),
  )

/** Deletes inbox items without remembering them, unlike discarding. */
export const deleteInbox = createServerFn({ method: 'POST' })
  .middleware([requireOwner])
  .validator((input: unknown) => inboxSelectionSchema.parse(input))
  .handler(({ data }) =>
    deleteInboxItems({ bucket: env.BUCKET, db: env.DB }, data.ids),
  )

/** What the owner discarded, newest first. */
export const getDiscarded = createServerFn({ method: 'GET' })
  .middleware([requireOwner])
  .handler(() => listDiscards(env.DB))

/** Forgets a discard entry, so agents can save that source again. */
export const forgetDiscarded = createServerFn({ method: 'POST' })
  .middleware([requireOwner])
  .validator((input: unknown) => discardIdSchema.parse(input))
  .handler(({ data }) => forgetDiscard(env.DB, data.id))
