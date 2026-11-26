import { type QueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { z } from 'zod'
import { ItemDetail } from '@/components/gallery/item-detail'
import { ItemEditor } from '@/components/gallery/item-editor'
import { NotFound } from '@/components/not-found'
import type { Owner } from '@/lib/auth/owner'
import { useOwner } from '@/lib/auth/use-owner'
import type { ItemView } from '@/lib/items/item-view'
import { itemLabel } from '@/lib/items/model'
import { itemShareMeta } from '@/lib/items/share'
import { itemQuery } from '@/lib/queries'
import { getRequestOrigin } from '@/lib/request-origin'

interface ItemPageData extends ItemView {
  /** The site's origin, for the absolute URLs in the share tags. */
  origin: string
}

async function loadItem({
  params,
  context,
}: {
  params: { id: string }
  context: { owner: Owner | null; queryClient: QueryClient }
}): Promise<ItemPageData> {
  const options = itemQuery(params.id, context.owner?.email)
  await context.queryClient.ensureQueryData(options)
  const view = await context.queryClient.fetchQuery(options)
  if (!view) {
    throw notFound()
  }
  return { ...view, origin: getRequestOrigin() }
}

/**
 * The page title, plus Open Graph and Twitter card tags for published items
 * so shared links preview well. Inbox items are private: no share tags.
 */
function itemHead(data: ItemPageData | undefined) {
  if (!data) {
    return { meta: [] }
  }
  return {
    meta: [
      { title: `${itemLabel(data.item)} · Taste` },
      ...(data.published ? itemShareMeta(data.item, data.origin) : []),
    ],
  }
}

export const Route = createFileRoute('/items/$id')({
  component: ItemPage,
  head: ({ loaderData }) => itemHead(loaderData),
  loader: loadItem,
  notFoundComponent: () => <NotFound title='Item not found' />,
  // `?edit=true` opens the owner's edit form straight away.
  validateSearch: z
    .object({ edit: z.boolean().optional().catch(undefined) })
    .catch({})
    .transform(({ edit }) => (edit ? { edit } : {})),
})

function ItemPage() {
  const owner = useOwner()
  const { id } = Route.useParams()
  const { data } = useSuspenseQuery(itemQuery(id, owner?.email))
  const { edit } = Route.useSearch()
  const navigate = Route.useNavigate()
  if (!data) {
    throw notFound()
  }
  const { item, editor, published, tags } = data
  return (
    <ItemDetail
      editor={
        owner && editor ? (
          <ItemEditor
            initial={editor}
            key={JSON.stringify(editor)}
            onEditingEnd={() =>
              edit ? navigate({ replace: true, search: {} }) : undefined
            }
            startEditing={edit}
            tags={tags}
          />
        ) : null
      }
      item={item}
      published={published}
    />
  )
}
