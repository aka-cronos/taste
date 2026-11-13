import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { DiscardedView } from '@/components/inbox/discarded-view'
import { useOwner } from '@/lib/auth/use-owner'
import { discardedQuery } from '@/lib/queries'

export const Route = createFileRoute('/inbox_/discarded')({
  // Only the owner has an inbox; everyone else gets a plain not-found page.
  beforeLoad: ({ context }) => {
    if (!context.owner) {
      throw notFound()
    }
  },
  component: DiscardedPage,
  head: () => ({ meta: [{ title: 'Discarded · Taste' }] }),
  loader: async ({ context }) => {
    if (!context.owner) {
      throw notFound()
    }
    await context.queryClient.ensureQueryData({
      ...discardedQuery(context.owner.email),
      revalidateIfStale: true,
    })
  },
  notFoundComponent: DiscardedNotFound,
})

function DiscardedPage() {
  const owner = useOwner()
  return owner ? <DiscardedData email={owner.email} /> : <DiscardedNotFound />
}

function DiscardedData({ email }: { email: string }) {
  const { count, entries } = useSuspenseQuery(discardedQuery(email)).data
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
