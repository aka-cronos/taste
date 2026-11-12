import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { itemLabel } from '@/components/gallery/item-card'
import { ItemDetail } from '@/components/gallery/item-detail'
import { getGalleryItem } from '@/lib/items/server'

export const Route = createFileRoute('/items/$id')({
  component: ItemPage,
  head: ({ loaderData }) => ({
    meta: loaderData ? [{ title: `${itemLabel(loaderData)} · Taste` }] : [],
  }),
  loader: async ({ params }) => {
    const item = await getGalleryItem({ data: { id: params.id } })
    if (!item) {
      throw notFound()
    }
    return item
  },
  notFoundComponent: ItemNotFound,
})

function ItemPage() {
  return <ItemDetail item={Route.useLoaderData()} />
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
