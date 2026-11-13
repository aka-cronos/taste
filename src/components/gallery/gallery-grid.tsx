import { useState, useSyncExternalStore } from 'react'
import { ItemCard } from '@/components/gallery/item-card'
import { Button } from '@/components/ui/button'
import type { GalleryPage } from '@/lib/items/model'

const columnQueries = [
  '(min-width: 640px)',
  '(min-width: 1024px)',
  '(min-width: 1280px)',
]

function subscribeColumns(onChange: () => void) {
  const queries = columnQueries.map(query => window.matchMedia(query))
  for (const query of queries) {
    query.addEventListener('change', onChange)
  }
  return () => {
    for (const query of queries) {
      query.removeEventListener('change', onChange)
    }
  }
}

function getColumnCount() {
  return (
    2 + columnQueries.filter(query => window.matchMedia(query).matches).length
  )
}

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
  const columnCount = useSyncExternalStore(
    subscribeColumns,
    getColumnCount,
    () => 2,
  )
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
      <div className='grid grid-cols-2 items-start gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5'>
        {['first', 'second', 'third', 'fourth', 'fifth']
          .slice(0, Math.min(columnCount, items.length))
          .map((column, columnIndex) => (
            <div className='flex min-w-0 flex-col gap-3 sm:gap-4' key={column}>
              {items
                .filter((_, index) => index % columnCount === columnIndex)
                .map(item => (
                  <ItemCard item={item} key={item.id} />
                ))}
            </div>
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
