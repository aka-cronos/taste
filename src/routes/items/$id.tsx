import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { z } from 'zod'
import { itemLabel } from '@/components/gallery/item-card'
import { ItemDetail } from '@/components/gallery/item-detail'
import { ItemEditor } from '@/components/gallery/item-editor'
import type { Owner } from '@/lib/auth/owner'
import { useOwner } from '@/lib/auth/use-owner'
import type { ItemEditorData } from '@/lib/items/edit-input'
import { getOwnerItem } from '@/lib/items/manage-server'
import type { GalleryItem } from '@/lib/items/model'
import { getGalleryItem } from '@/lib/items/server'

async function loadItem({
  params,
  context,
}: {
  params: { id: string }
  context: { owner: Owner | null }
}): Promise<{
  item: GalleryItem
  editor: ItemEditorData | null
  tags: string[]
}> {
  const result = context.owner
    ? await getOwnerItem({ data: { id: params.id } })
    : {
        editor: null,
        item: await getGalleryItem({ data: { id: params.id } }),
        tags: [],
      }
  const { item } = result
  if (!item) {
    throw notFound()
  }
  return { ...result, item }
}

export const Route = createFileRoute('/items/$id')({
  component: ItemPage,
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [{ title: `${itemLabel(loaderData.item)} · Taste` }]
      : [],
  }),
  loader: loadItem,
  notFoundComponent: ItemNotFound,
  // `?edit=true` opens the owner's edit form straight away.
  validateSearch: z
    .object({ edit: z.boolean().optional().catch(undefined) })
    .catch({})
    .transform(({ edit }) => (edit ? { edit } : {})),
})

function ItemPage() {
  const { item, editor, tags } = Route.useLoaderData()
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
