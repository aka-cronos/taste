import { createFileRoute } from '@tanstack/react-router'
import { GalleryGrid } from '@/components/gallery/gallery-grid'
import { listGallery } from '@/lib/items/server'

export const Route = createFileRoute('/')({
  component: GalleryPage,
  loader: () => listGallery({ data: {} }),
})

function GalleryPage() {
  const page = Route.useLoaderData()
  return (
    <main className='mx-auto max-w-6xl px-4 py-6'>
      <h1 className='sr-only'>Taste</h1>
      <GalleryGrid
        initialPage={page}
        loadPage={cursor => listGallery({ data: { cursor } })}
      />
    </main>
  )
}
