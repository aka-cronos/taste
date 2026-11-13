import { createFileRoute, useRouter } from '@tanstack/react-router'
import { z } from 'zod'
import { AddItem } from '@/components/gallery/add-item'
import { GalleryFilters } from '@/components/gallery/gallery-filters'
import { GalleryGrid } from '@/components/gallery/gallery-grid'
import { useOwner } from '@/lib/auth/use-owner'
import { galleryFiltersSchema } from '@/lib/items/search'
import { listGallery, listGalleryTags } from '@/lib/items/server'

const gallerySearchSchema = galleryFiltersSchema.and(
  z
    .object({ error: z.string().trim().optional().catch(undefined) })
    .catch({})
    .transform(({ error }) => (error ? { error } : {})),
)

export const Route = createFileRoute('/')({
  component: GalleryPage,
  loader: async ({ deps }) => {
    const [page, tags] = await Promise.all([
      listGallery({ data: deps }),
      listGalleryTags(),
    ])
    return { page, tags }
  },
  loaderDeps: ({ search }) => galleryFiltersSchema.parse(search),
  search: {
    middlewares: [
      ({ search, next }) => gallerySearchSchema.parse(next(search)),
    ],
  },
  validateSearch: gallerySearchSchema,
})

function GalleryPage() {
  const owner = useOwner()
  const router = useRouter()
  const { page, tags } = Route.useLoaderData()
  const filters = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <main className='mx-auto max-w-6xl px-4 py-6'>
      <h1 className='sr-only'>Taste</h1>
      {owner ? (
        <AddItem onSaved={() => router.invalidate()} tags={tags} />
      ) : null}
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
