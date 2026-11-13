import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { DiscardedView } from '@/components/inbox/discarded-view'
import { getDiscarded } from '@/lib/items/inbox-server'

export const Route = createFileRoute('/inbox_/discarded')({
  // Only the owner has an inbox; everyone else gets a plain not-found page.
  beforeLoad: ({ context }) => {
    if (!context.owner) {
      throw notFound()
    }
  },
  component: DiscardedPage,
  head: () => ({ meta: [{ title: 'Discarded · Taste' }] }),
  loader: () => getDiscarded(),
  notFoundComponent: DiscardedNotFound,
})

function DiscardedPage() {
  const { count, entries } = Route.useLoaderData()
  return <DiscardedView count={count} entries={entries} />
}

function DiscardedNotFound() {
  return (
    <main className='flex flex-col items-center gap-3 px-4 py-24 text-center'>
      <h1 className='font-heading text-2xl font-semibold'>Page not found</h1>
      <Link className='underline underline-offset-4' to='/'>
        Back to the gallery
      </Link>
    </main>
  )
}
