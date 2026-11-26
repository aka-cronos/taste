import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { InboxView } from '@/components/inbox/inbox-view'
import { NotFound } from '@/components/not-found'
import { useOwner } from '@/lib/auth/use-owner'
import { inboxQuery } from '@/lib/queries'

export const Route = createFileRoute('/inbox')({
  // Only the owner has an inbox; everyone else gets a plain not-found page.
  beforeLoad: ({ context }) => {
    if (!context.owner) {
      throw notFound()
    }
  },
  component: InboxPage,
  head: () => ({ meta: [{ title: 'Inbox · Taste' }] }),
  loader: async ({ context }) => {
    if (!context.owner) {
      throw notFound()
    }
    await context.queryClient.ensureQueryData({
      ...inboxQuery(context.owner.email),
      revalidateIfStale: true,
    })
  },
  notFoundComponent: () => <NotFound />,
})

function InboxPage() {
  const owner = useOwner()
  return owner ? <InboxData email={owner.email} /> : <NotFound />
}

function InboxData({ email }: { email: string }) {
  const { count, items } = useSuspenseQuery(inboxQuery(email)).data
  return <InboxView count={count} items={items} />
}
