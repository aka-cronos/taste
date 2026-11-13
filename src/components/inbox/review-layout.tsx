import type { ReactNode } from 'react'
import { InboxNav, type InboxSection } from '@/components/inbox/inbox-nav'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'

interface ReviewLayoutProps {
  children: ReactNode
  /** Which tab is active. */
  current: InboxSection
  /** What the section is for; one or two sentences. */
  description: ReactNode
  /** A short live summary, such as a count, under the title. */
  status: ReactNode
  title: string
}

/**
 * The frame every inbox tab shares. Title and tabs sit on one row, the status
 * and description in fixed slots below, so switching tabs only changes the
 * content.
 */
export function ReviewLayout({
  children,
  current,
  description,
  status,
  title,
}: ReviewLayoutProps) {
  return (
    <main className='mx-auto w-full max-w-4xl px-4 py-6'>
      <header className='mb-4 flex flex-col gap-1'>
        <div className='flex items-center justify-between gap-3'>
          <h1 className='font-heading truncate text-2xl font-semibold tracking-tight'>
            {title}
          </h1>
          <InboxNav current={current} />
        </div>
        <p className='text-muted-foreground min-h-5 text-sm'>{status}</p>
        <p className='text-muted-foreground text-sm'>{description}</p>
      </header>
      {children}
    </main>
  )
}

/** What an inbox tab shows when it has nothing to list. */
export function ReviewEmpty({
  children,
  title,
}: {
  /** What would show up here, and how it gets here. */
  children: ReactNode
  title: string
}) {
  return (
    <Empty className='py-24'>
      <EmptyHeader>
        <EmptyTitle className='text-base'>{title}</EmptyTitle>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
