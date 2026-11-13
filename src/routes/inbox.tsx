import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { InboxView } from '@/components/inbox/inbox-view'
import { getInbox } from '@/lib/items/inbox-server'

export const Route = createFileRoute('/inbox')({
  // Only the owner has an inbox; everyone else gets a plain not-found page.
  beforeLoad: ({ context }) => {
    if (!context.owner) {
      throw notFound()
    }
  },
  component: InboxPage,
  head: () => ({ meta: [{ title: 'Inbox · Taste' }] }),
  loader: () => getInbox(),
  notFoundComponent: InboxNotFound,
})

function InboxPage() {
  const { count, items } = Route.useLoaderData()
  return <InboxView count={count} items={items} />
}

function InboxNotFound() {
  return (
    <main className='flex flex-col items-center gap-3 px-4 py-24 text-center'>
      <h1 className='font-heading text-2xl font-semibold'>Page not found</h1>
      <Link className='underline underline-offset-4' to='/'>
        Back to the gallery
      </Link>
    </main>
  )
}
