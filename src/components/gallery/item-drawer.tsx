import { useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { GalleryDrawer } from '@/components/gallery/gallery-drawer'
import { ItemDetail } from '@/components/gallery/item-detail'
import { ItemEditor } from '@/components/gallery/item-editor'
import { useOwner } from '@/lib/auth/use-owner'
import { type ItemView, loadItemView } from '@/lib/items/item-view'
import { itemLabel } from '@/lib/items/model'

interface Loaded {
  failed: boolean
  id: string
  view: ItemView | null
}

/**
 * Loads the item open in the drawer, and loads it again whenever the router
 * is invalidated (for example after saving edits) without changing location.
 */
function useItemView(id: string | undefined) {
  const router = useRouter()
  const signedIn = Boolean(useOwner())
  const [loaded, setLoaded] = useState<Loaded>()
  useEffect(() => {
    if (!id) {
      return
    }
    let active = true
    let latest = 0
    const load = () => {
      latest += 1
      const request = latest
      const settle = (next: Omit<Loaded, 'id'>) => {
        if (active && request === latest) {
          setLoaded({ ...next, id })
        }
      }
      loadItemView(id, signedIn).then(
        view => settle({ failed: false, view }),
        () => settle({ failed: true, view: null }),
      )
    }
    load()
    const unsubscribe = router.subscribe('onResolved', event => {
      if (!event.hrefChanged) {
        load()
      }
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [id, router, signedIn])
  return loaded
}

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
  const loaded = useItemView(id)
  // While closing, keep showing the last item until the drawer is gone.
  const shown = id === undefined || loaded?.id === id ? loaded : undefined
  let title = 'Loading…'
  let body = <DrawerMessage>Loading…</DrawerMessage>
  if (shown?.failed) {
    title = 'Could not load the item'
    body = <DrawerMessage>Please try again.</DrawerMessage>
  } else if (shown?.view) {
    const { editor, item, tags } = shown.view
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
        variant='drawer'
      />
    )
  } else if (shown) {
    title = 'Item not found'
    body = <DrawerMessage>This item is no longer available.</DrawerMessage>
  }
  return (
    <GalleryDrawer onClose={() => onClose()} open={Boolean(id)} title={title}>
      {body}
    </GalleryDrawer>
  )
}
