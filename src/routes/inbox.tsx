import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { InboxView } from '@/components/inbox/inbox-view'
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
  notFoundComponent: InboxNotFound,
})

function InboxPage() {
  const owner = useOwner()
  return owner ? <InboxData email={owner.email} /> : <InboxNotFound />
}

function InboxData({ email }: { email: string }) {
  const { count, items } = useSuspenseQuery(inboxQuery(email)).data
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
