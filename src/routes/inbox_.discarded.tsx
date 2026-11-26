import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { DiscardedView } from '@/components/inbox/discarded-view'
import { NotFound } from '@/components/not-found'
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
  notFoundComponent: () => <NotFound />,
})

function DiscardedPage() {
  const owner = useOwner()
  return owner ? <DiscardedData email={owner.email} /> : <NotFound />
}

function DiscardedData({ email }: { email: string }) {
  const { count, entries } = useSuspenseQuery(discardedQuery(email)).data
  return <DiscardedView count={count} entries={entries} />
}
