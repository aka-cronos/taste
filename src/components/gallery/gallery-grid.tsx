import { useState } from 'react'
import { ItemCard } from '@/components/gallery/item-card'
import { Button } from '@/components/ui/button'
import type { GalleryPage } from '@/lib/items/model'

interface GalleryGridProps {
  filtered?: boolean
  initialPage: GalleryPage
  loadPage: (cursor: string) => Promise<GalleryPage>
}

/** Masonry grid of gallery items, with a button to load the next page. */
export function GalleryGrid({
  filtered = false,
  initialPage,
  loadPage,
}: GalleryGridProps) {
  const [items, setItems] = useState(initialPage.items)
  const [cursor, setCursor] = useState(initialPage.nextCursor)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  if (items.length === 0) {
    return (
      <p className='text-muted-foreground py-24 text-center'>
        {filtered ? 'No items match these filters.' : 'Nothing here yet.'}
      </p>
    )
  }

  const loadMore = async () => {
    if (!cursor) {
      return
    }
    setLoading(true)
    setFailed(false)
    try {
      const page = await loadPage(cursor)
      setItems(current => [...current, ...page.items])
      setCursor(page.nextCursor)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className='columns-2 gap-3 sm:columns-3 sm:gap-4 lg:columns-4 xl:columns-5'>
        {items.map(item => (
          <ItemCard item={item} key={item.id} />
        ))}
      </div>
      {cursor ? (
        <div className='flex flex-col items-center gap-2 py-8'>
          <Button disabled={loading} onClick={loadMore} variant='outline'>
            {loading ? 'Loading…' : 'Show more'}
          </Button>
          {failed ? (
            <p className='text-destructive text-sm' role='alert'>
              Could not load more items. Try again.
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
