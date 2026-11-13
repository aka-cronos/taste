import { useRouter } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { ReviewEmpty, ReviewLayout } from '@/components/inbox/review-layout'
import { Button } from '@/components/ui/button'
import type { DiscardEntry } from '@/lib/items/discards'
import { forgetDiscarded } from '@/lib/items/inbox-server'
import { handleSessionError, refreshQueries } from '@/lib/refresh-queries'

interface DiscardedViewProps {
  /** Every entry, which can exceed the capped list. */
  count: number
  entries: DiscardEntry[]
  /** Overridable for tests. */
  onForget?: (id: number) => Promise<unknown>
}

// A fixed time zone keeps the server and browser renders identical.
const dateFormat = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeZone: 'UTC',
})

function plural(count: number) {
  return count === 1 ? '1 item' : `${count} items`
}

export function discardLabel(entry: DiscardEntry) {
  return entry.title || entry.sourceHost || 'Untitled image'
}

/** What the owner discarded from the inbox, and a way to forget it. */
export function DiscardedView({
  count,
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
      await refreshQueries(router)
    } catch (caughtError) {
      handleSessionError(router, caughtError)
      setError('Could not forget it. Please try again.')
    } finally {
      pending.current = false
      setBusyId(null)
    }
  }

  return (
    <ReviewLayout
      current='discarded'
      description={
        <>Agents won&apos;t save these again. Forget one to allow it.</>
      }
      status={
        count === 0 ? 'Nothing to forget.' : `${plural(count)} remembered.`
      }
      title='Discarded'
    >
      {error ? (
        <p className='text-destructive mb-3 text-sm' role='alert'>
          {error}
        </p>
      ) : null}

      {entries.length === 0 ? (
        <ReviewEmpty title='Nothing discarded.'>
          What you discard from the inbox shows up here.
        </ReviewEmpty>
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
    </ReviewLayout>
  )
}
