import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { requireOwner } from '@/lib/auth/session'
import {
  editItemSchema,
  itemIdSchema,
  visibilitySchema,
} from '@/lib/items/edit-input'
import {
  deleteItem,
  getItemEditor,
  listOwnerTags,
  setItemVisibility,
  updateItem,
} from '@/lib/items/manage'
import { getOwnerGalleryItem } from '@/lib/items/repository'

export const getOwnerItem = createServerFn({ method: 'GET' })
  .middleware([requireOwner])
  .validator((input: unknown) => itemIdSchema.parse(input))
  .handler(async ({ data }) => {
    const [item, editor, tags] = await Promise.all([
      getOwnerGalleryItem(env.DB, data.id),
      getItemEditor(env.DB, data.id),
      listOwnerTags(env.DB),
    ])
    return { editor, item, tags }
  })

export const saveItemEdits = createServerFn({ method: 'POST' })
  .middleware([requireOwner])
  .validator((input: unknown) => editItemSchema.parse(input))
  .handler(({ data }) => updateItem(env.DB, data))

export const changeItemVisibility = createServerFn({ method: 'POST' })
  .middleware([requireOwner])
  .validator((input: unknown) => visibilitySchema.parse(input))
  .handler(({ data }) => setItemVisibility(env.DB, data.id, data.status))

export const permanentlyDeleteItem = createServerFn({ method: 'POST' })
  .middleware([requireOwner])
  .validator((input: unknown) => itemIdSchema.parse(input))
  .handler(({ data }) =>
    deleteItem({ bucket: env.BUCKET, db: env.DB }, data.id),
  )
