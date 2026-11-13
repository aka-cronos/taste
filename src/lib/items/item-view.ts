import type { ItemEditorData } from '@/lib/items/edit-input'
import { getOwnerItem } from '@/lib/items/manage-server'
import type { GalleryItem } from '@/lib/items/model'
import { getGalleryItem } from '@/lib/items/server'

/** What the item page and the item drawer show for one item. */
export interface ItemView {
  /** The owner's edit data, or null for visitors. */
  editor: ItemEditorData | null
  item: GalleryItem
  /** True when the item is in the public gallery and can be shared. */
  published: boolean
  /** Tag suggestions for the editor. */
  tags: string[]
}

/**
 * Loads an item for the owner (any status, with edit data) or for a visitor
 * (published items only). Returns null when the item is not visible.
 */
export async function loadItemView(
  id: string,
  signedIn: boolean,
): Promise<ItemView | null> {
  if (!signedIn) {
    // Visitors only ever get published items.
    const item = await getGalleryItem({ data: { id } })
    return item ? { editor: null, item, published: true, tags: [] } : null
  }
  const { editor, item, tags } = await getOwnerItem({ data: { id } })
  return item
    ? { editor, item, published: editor?.status === 'published', tags }
    : null
}
