import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { GalleryDrawer } from '@/components/gallery/gallery-drawer'
import { ItemDetail } from '@/components/gallery/item-detail'
import { ItemEditor } from '@/components/gallery/item-editor'
import { useOwner } from '@/lib/auth/use-owner'
import { itemLabel } from '@/lib/items/model'
import { itemQuery } from '@/lib/queries'

function DrawerMessage({ children }: { children: string }) {
  return <p className='text-muted-foreground py-8 text-center'>{children}</p>
}

/**
 * The item detail in a drawer over the gallery, opened from a card. The owner
 * can edit the item in place. `id` is the open item, or undefined when
 * closed; `onClose` asks to close it through navigation.
 */
export function ItemDrawer({
  id,
  onClose,
}: {
  id: string | undefined
  onClose: (options?: { ignoreBlocker?: boolean }) => Promise<unknown>
}) {
  const owner = useOwner()
  const [lastId, setLastId] = useState(id)
  if (id && lastId !== id) {
    setLastId(id)
  }
  const { data: view, isError } = useQuery({
    ...itemQuery(id ?? lastId ?? '', owner?.email),
    enabled: Boolean(id),
    retryOnMount: false,
  })
  let title = 'Loading…'
  let body = <DrawerMessage>Loading…</DrawerMessage>
  if (isError) {
    title = 'Could not load the item'
    body = <DrawerMessage>Please try again.</DrawerMessage>
  } else if (view) {
    const { editor, item, published, tags } = view
    title = itemLabel(item)
    body = (
      <ItemDetail
        editor={
          owner && editor ? (
            <ItemEditor
              confirmDiscard
              initial={editor}
              key={JSON.stringify(editor)}
              onDeleted={() => onClose({ ignoreBlocker: true })}
              tags={tags}
            />
          ) : null
        }
        item={item}
        published={published}
        variant='drawer'
      />
    )
  } else if (view === null) {
    title = 'Item not found'
    body = <DrawerMessage>This item is no longer available.</DrawerMessage>
  }
  return (
    <GalleryDrawer onClose={() => onClose()} open={Boolean(id)} title={title}>
      {body}
    </GalleryDrawer>
  )
}
