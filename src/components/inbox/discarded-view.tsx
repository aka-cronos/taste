import { useRouter } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { InboxNav } from '@/components/inbox/inbox-nav'
import { Button } from '@/components/ui/button'
import type { DiscardEntry } from '@/lib/items/discards'
import { forgetDiscarded } from '@/lib/items/inbox-server'

interface DiscardedViewProps {
  entries: DiscardEntry[]
  /** Overridable for tests. */
  onForget?: (id: number) => Promise<unknown>
}

// A fixed time zone keeps the server and browser renders identical.
const dateFormat = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeZone: 'UTC',
})

export function discardLabel(entry: DiscardEntry) {
  return entry.title || entry.sourceHost || 'Untitled image'
}

/** What the owner discarded from the inbox, and a way to forget it. */
export function DiscardedView({
  entries,
  onForget = id => forgetDiscarded({ data: { id } }),
}: DiscardedViewProps) {
  const router = useRouter()
  const pending = useRef<boolean>(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState('')

  async function forget(entry: DiscardEntry) {
    if (pending.current) {
      return
    }
    pending.current = true
    setBusyId(entry.id)
    setError('')
    try {
      await onForget(entry.id)
      toast.success('Forgotten. Agents can save it again.')
      await router.invalidate()
    } catch {
      setError('Could not forget it. Please try again.')
    } finally {
      pending.current = false
      setBusyId(null)
    }
  }

  return (
    <main className='mx-auto max-w-4xl px-4 py-6'>
      <div className='mb-4 flex flex-wrap items-start justify-between gap-3'>
        <div className='flex flex-col gap-1'>
          <h1 className='font-heading text-2xl font-semibold tracking-tight'>
            Discarded
          </h1>
          <p className='text-muted-foreground text-sm'>
            Agents won&apos;t save these again. Forget one to allow it.
          </p>
        </div>
        <InboxNav current='discarded' />
      </div>

      {error ? (
        <p className='text-destructive mb-3 text-sm' role='alert'>
          {error}
        </p>
      ) : null}

      {entries.length === 0 ? (
        <p className='text-muted-foreground py-24 text-center'>
          Nothing discarded. What you discard from the inbox shows up here.
        </p>
      ) : (
        <ul aria-label='Discarded items' className='flex flex-col divide-y'>
          {entries.map(entry => {
            const label = discardLabel(entry)
            return (
              <li className='flex items-center gap-3 py-3' key={entry.id}>
                <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
                  <span className='line-clamp-2 leading-snug font-medium [overflow-wrap:anywhere]'>
                    {label}
                  </span>
                  <span className='text-muted-foreground flex min-w-0 flex-wrap gap-x-2 text-xs'>
                    {entry.sourceUrl ? (
                      <a
                        className='max-w-full truncate underline-offset-4 hover:underline'
                        href={entry.sourceUrl}
                        rel='noopener noreferrer nofollow'
                        target='_blank'
                      >
                        {entry.sourceHost ?? entry.sourceUrl}
                      </a>
                    ) : (
                      <span>Uploaded image</span>
                    )}
                    <time dateTime={new Date(entry.discardedAt).toISOString()}>
                      {dateFormat.format(entry.discardedAt)}
                    </time>
                  </span>
                </div>
                <Button
                  aria-label={`Forget ${label}`}
                  disabled={busyId !== null}
                  onClick={() => forget(entry)}
                  size='sm'
                  variant='outline'
                >
                  {busyId === entry.id ? 'Forgetting…' : 'Forget'}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
