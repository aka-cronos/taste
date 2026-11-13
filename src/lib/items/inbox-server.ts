import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { requireOwner } from '@/lib/auth/session'
import { inboxSelectionSchema } from '@/lib/items/edit-input'
import { discardInboxItems, publishInboxItems } from '@/lib/items/manage'
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
