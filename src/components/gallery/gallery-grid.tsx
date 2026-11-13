import { useSuspenseInfiniteQuery } from '@tanstack/react-query'
import { cn } from 'cn'
import { ItemCard } from '@/components/gallery/item-card'
import { Button } from '@/components/ui/button'
import type { GalleryFilters } from '@/lib/items/search'
import { galleryQuery } from '@/lib/queries'

interface GalleryGridProps {
  filtered?: boolean
  filters: GalleryFilters
}

/** Masonry grid of gallery items, with a button to load the next page. */
export function GalleryGrid({ filtered = false, filters }: GalleryGridProps) {
  const {
    data,
    hasNextPage: cursor,
    isFetchingNextPage: loading,
    isFetchNextPageError: failed,
    fetchNextPage,
  } = useSuspenseInfiniteQuery(galleryQuery(filters))
  const items = data.pages.flatMap(page => page.items)

  if (items.length === 0) {
    return (
      <p className='text-muted-foreground py-24 text-center'>
        {filtered ? 'No items match these filters.' : 'Nothing here yet.'}
      </p>
    )
  }

  return (
    <>
      <div
        className={cn(
          'items-start gap-3 sm:gap-4',
          items.length <= 2 ? 'grid grid-cols-2' : 'columns-2',
          items.length <= 3 ? 'sm:grid sm:grid-cols-3' : 'sm:columns-3',
          items.length <= 4 ? 'lg:grid lg:grid-cols-4' : 'lg:columns-4',
          items.length <= 5 ? 'xl:grid xl:grid-cols-5' : 'xl:columns-5',
        )}
      >
        {items.map(item => (
          <ItemCard item={item} key={item.id} />
        ))}
      </div>
      {cursor ? (
        <div className='flex flex-col items-center gap-2 py-8'>
          <Button
            disabled={loading}
            onClick={() => fetchNextPage()}
            variant='outline'
          >
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
