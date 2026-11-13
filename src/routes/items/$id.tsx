import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { z } from 'zod'
import { ItemDetail } from '@/components/gallery/item-detail'
import { ItemEditor } from '@/components/gallery/item-editor'
import type { Owner } from '@/lib/auth/owner'
import { useOwner } from '@/lib/auth/use-owner'
import { type ItemView, loadItemView } from '@/lib/items/item-view'
import { itemLabel } from '@/lib/items/model'
import { itemShareMeta } from '@/lib/items/share'
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
  context: { owner: Owner | null }
}): Promise<ItemPageData> {
  const view = await loadItemView(params.id, Boolean(context.owner))
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
  notFoundComponent: ItemNotFound,
  // `?edit=true` opens the owner's edit form straight away.
  validateSearch: z
    .object({ edit: z.boolean().optional().catch(undefined) })
    .catch({})
    .transform(({ edit }) => (edit ? { edit } : {})),
})

function ItemPage() {
  const { item, editor, published, tags } = Route.useLoaderData()
  const owner = useOwner()
  const { edit } = Route.useSearch()
  const navigate = Route.useNavigate()
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

function ItemNotFound() {
  return (
    <main className='flex flex-col items-center gap-3 px-4 py-24 text-center'>
      <h1 className='font-heading text-2xl font-semibold'>Item not found</h1>
      <Link className='underline underline-offset-4' to='/'>
        Back to the gallery
      </Link>
    </main>
  )
}
