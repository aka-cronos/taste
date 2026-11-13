import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { z } from 'zod'
import { AddItem } from '@/components/gallery/add-item'
import { GalleryFilters } from '@/components/gallery/gallery-filters'
import { GalleryGrid } from '@/components/gallery/gallery-grid'
import { itemMask } from '@/components/gallery/item-card'
import { ItemDrawer } from '@/components/gallery/item-drawer'
import { useOwner } from '@/lib/auth/use-owner'
import { galleryFiltersSchema } from '@/lib/items/search'
import { galleryQuery, itemQuery, tagsQuery } from '@/lib/queries'
import { refreshQueries } from '@/lib/refresh-queries'

const gallerySearchSchema = galleryFiltersSchema.and(
  z
    .object({
      // The add form's drawer is open.
      add: z.boolean().optional().catch(undefined),
      error: z.string().trim().optional().catch(undefined),
      // The item open in the drawer; see `itemMask`.
      item: z.string().trim().optional().catch(undefined),
    })
    .catch({})
    .transform(({ add, error, item }) => ({
      ...(add ? { add } : {}),
      ...(error ? { error } : {}),
      ...(item ? { item } : {}),
    })),
)

type GallerySearch = z.output<typeof gallerySearchSchema>
type Filters = Omit<GallerySearch, 'add' | 'item'>
type Panel = Pick<GallerySearch, 'add' | 'item'>

/**
 * Navigation to the gallery with `filters` and the drawer in `panel` open.
 * An open drawer is masked: an item shows its page's URL, the add form the
 * gallery's.
 */
function galleryLocation(filters: Filters, { add, item }: Panel) {
  if (item) {
    return { mask: itemMask(item), search: { ...filters, item } }
  }
  if (add) {
    const mask = { search: filters, to: '/', unmaskOnReload: true } as const
    return { mask, search: { ...filters, add } }
  }
  return { search: filters }
}

function galleryLoaderDeps({ search }: { search: GallerySearch }) {
  return { filters: galleryFiltersSchema.parse(search), item: search.item }
}

export const Route = createFileRoute('/')({
  component: GalleryPage,
  loader: async ({ deps, context }) => {
    await Promise.all([
      context.queryClient.ensureInfiniteQueryData({
        ...galleryQuery(deps.filters),
        revalidateIfStale: true,
      }),
      context.queryClient.ensureQueryData({
        ...tagsQuery(),
        revalidateIfStale: true,
      }),
      deps.item
        ? context.queryClient
            .ensureQueryData({
              ...itemQuery(deps.item, context.owner?.email),
              revalidateIfStale: true,
            })
            .catch(() => undefined)
        : undefined,
    ])
  },
  loaderDeps: galleryLoaderDeps,
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
  const { add, item, ...filters } = Route.useSearch()
  const { data: tags } = useSuspenseQuery(tagsQuery())
  const navigate = Route.useNavigate()
  const showPanel = (panel: Panel, options?: { ignoreBlocker?: boolean }) =>
    navigate({
      ...galleryLocation(filters, panel),
      resetScroll: false,
      ...options,
    })
  return (
    <main className='mx-auto max-w-6xl px-4 py-6'>
      <h1 className='sr-only'>Taste</h1>
      {owner ? (
        <AddItem
          onOpenChange={(open, options) =>
            showPanel(open ? { add: true } : {}, options)
          }
          onSaved={() => refreshQueries(router)}
          open={Boolean(add)}
          tags={tags}
        />
      ) : null}
      <GalleryFilters
        filters={filters}
        onChange={search => navigate(galleryLocation(search, { add, item }))}
        tags={tags}
      />
      <GalleryGrid
        filtered={Boolean(filters.q || filters.type || filters.tags?.length)}
        filters={filters}
      />
      <ItemDrawer id={item} onClose={options => showPanel({}, options)} />
    </main>
  )
}
