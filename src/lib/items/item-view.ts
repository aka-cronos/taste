import type { ItemEditorData } from '@/lib/items/edit-input'
import { getOwnerItem } from '@/lib/items/manage-server'
import type { GalleryItem } from '@/lib/items/model'
import { getGalleryItem } from '@/lib/items/server'

/** What the item page and the item drawer show for one item. */
export interface ItemView {
  /** The owner's edit data, or null for visitors. */
  editor: ItemEditorData | null
  item: GalleryItem
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
  const view = signedIn
    ? await getOwnerItem({ data: { id } })
    : { editor: null, item: await getGalleryItem({ data: { id } }), tags: [] }
  return view.item ? { ...view, item: view.item } : null
}
