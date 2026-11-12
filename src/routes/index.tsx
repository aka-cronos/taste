import { createFileRoute } from '@tanstack/react-router'
import { GalleryFilters } from '@/components/gallery/gallery-filters'
import { GalleryGrid } from '@/components/gallery/gallery-grid'
import { normalizeGalleryFilters } from '@/lib/items/search'
import { listGallery, listGalleryTags } from '@/lib/items/server'

export const Route = createFileRoute('/')({
  component: GalleryPage,
  loader: async ({ deps }) => {
    const [page, tags] = await Promise.all([
      listGallery({ data: deps }),
      listGalleryTags(),
    ])
    return { page, tags }
  },
  loaderDeps: ({ search }) => search,
  validateSearch: normalizeGalleryFilters,
})

function GalleryPage() {
  const { page, tags } = Route.useLoaderData()
  const filters = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <main className='mx-auto max-w-6xl px-4 py-6'>
      <h1 className='sr-only'>Taste</h1>
      <GalleryFilters
        filters={filters}
        onChange={search => navigate({ search })}
        tags={tags}
      />
      <GalleryGrid
        filtered={Boolean(filters.q || filters.type || filters.tags?.length)}
        initialPage={page}
        key={JSON.stringify([filters, page])}
        loadPage={cursor => listGallery({ data: { ...filters, cursor } })}
      />
    </main>
  )
}
