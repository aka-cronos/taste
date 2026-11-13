import { Link, useRouter } from '@tanstack/react-router'
import { BotIcon, FileTextIcon, LinkIcon, UserIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { itemLabel } from '@/components/gallery/item-card'
import { InboxNav } from '@/components/inbox/inbox-nav'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { discardInbox, publishInbox } from '@/lib/items/inbox-server'
import { hostnameOf, type InboxItem } from '@/lib/items/model'

interface InboxViewProps {
  /** How many items wait in the inbox, which can exceed those listed. */
  count: number
  items: InboxItem[]
  /** Overridable for tests. */
  onDiscard?: (ids: string[]) => Promise<unknown>
  onPublish?: (ids: string[]) => Promise<unknown>
}

function plural(count: number) {
  return count === 1 ? '1 item' : `${count} items`
}

function Thumbnail({ item }: { item: InboxItem }) {
  if (item.image) {
    return (
      <img
        alt=''
        className='bg-muted size-20 shrink-0 rounded-lg object-cover'
        decoding='async'
        height={80}
        loading='lazy'
        src={item.image.url}
        width={80}
      />
    )
  }
  const Icon = item.type === 'link' ? LinkIcon : FileTextIcon
  return (
    <div className='bg-muted text-muted-foreground flex size-20 shrink-0 items-center justify-center rounded-lg'>
      <Icon aria-hidden className='size-6' />
    </div>
  )
}

function Origin({ origin }: { origin: InboxItem['origin'] }) {
  return origin === 'agent' ? (
    <Badge variant='secondary'>
      <BotIcon aria-hidden data-icon='inline-start' />
      Saved by an agent
    </Badge>
  ) : (
    <Badge variant='outline'>
      <UserIcon aria-hidden data-icon='inline-start' />
      Added by you
    </Badge>
  )
}

/** The owner's review queue: publish or discard what agents saved. */
export function InboxView({
  count,
  items,
  onDiscard = ids => discardInbox({ data: { ids } }),
  onPublish = ids => publishInbox({ data: { ids } }),
}: InboxViewProps) {
  const router = useRouter()
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const pending = useRef<boolean>(false)
  const [discarding, setDiscarding] = useState<string[] | null>(null)
  const [error, setError] = useState('')

  // Drop selections for items that are gone after a refresh.
  const selectedIds = items
    .filter(item => selected.has(item.id))
    .map(item => item.id)
  const allSelected = items.length > 0 && selectedIds.length === items.length

  function toggle(id: string, checked: boolean) {
    setSelected(current => {
      const next = new Set(current)
      if (checked) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }

  async function run(
    action: 'publish' | 'discard',
    ids: string[],
  ): Promise<void> {
    if (pending.current || ids.length === 0) {
      return
    }
    pending.current = true
    setBusy(true)
    setError('')
    try {
      if (action === 'publish') {
        await onPublish(ids)
        toast.success(`Published ${plural(ids.length)} to your gallery.`)
      } else {
        await onDiscard(ids)
        toast.success(`Discarded ${plural(ids.length)}.`)
      }
      setDiscarding(null)
      setSelected(current => {
        const next = new Set(current)
        for (const id of ids) {
          next.delete(id)
        }
        return next
      })
      await router.invalidate()
    } catch {
      setError(
        action === 'publish'
          ? 'Could not publish. Please try again.'
          : 'Could not discard. Please try again.',
      )
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return (
    <main className='mx-auto max-w-4xl px-4 py-6'>
      <div className='mb-4 flex flex-wrap items-start justify-between gap-3'>
        <div className='flex flex-col gap-1'>
          <div className='flex flex-wrap items-baseline gap-x-3 gap-y-1'>
            <h1 className='font-heading text-2xl font-semibold tracking-tight'>
              Inbox
            </h1>
            <p className='text-muted-foreground text-sm'>
              {count === 0
                ? 'Nothing to review.'
                : `${plural(count)} waiting. Only you can see them.`}
            </p>
          </div>
          <p className='text-muted-foreground text-sm'>
            Publish what fits your taste. Discard what doesn&apos;t, and agents
            won&apos;t save it again.
          </p>
        </div>
        <InboxNav current='inbox' />
      </div>

      {items.length === 0 ? (
        <p className='text-muted-foreground py-24 text-center'>
          Your inbox is empty. Items your agents save show up here.
        </p>
      ) : (
        <>
          <div className='bg-background/95 sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-2 border-b py-2 backdrop-blur'>
            <label className='mr-auto flex items-center gap-2 text-sm'>
              <Checkbox
                checked={allSelected}
                disabled={busy}
                indeterminate={selectedIds.length > 0 && !allSelected}
                onCheckedChange={checked =>
                  setSelected(
                    new Set(checked ? items.map(item => item.id) : []),
                  )
                }
              />
              {selectedIds.length > 0
                ? `${selectedIds.length} selected`
                : 'Select all'}
            </label>
            <Button
              disabled={busy || selectedIds.length === 0}
              onClick={() => run('publish', selectedIds)}
              size='sm'
            >
              Publish selected
            </Button>
            <Button
              disabled={busy || selectedIds.length === 0}
              onClick={() => setDiscarding(selectedIds)}
              size='sm'
              variant='destructive'
            >
              Discard selected
            </Button>
          </div>

          {error && !discarding ? (
            <p className='text-destructive mb-3 text-sm' role='alert'>
              {error}
            </p>
          ) : null}

          <ul aria-label='Inbox items' className='flex flex-col gap-3'>
            {items.map(item => {
              const label = itemLabel(item)
              return (
                <li
                  className='bg-card text-card-foreground flex gap-3 rounded-xl border p-3'
                  key={item.id}
                >
                  <Checkbox
                    aria-label={`Select ${label}`}
                    checked={selected.has(item.id)}
                    className='mt-1'
                    disabled={busy}
                    onCheckedChange={checked => toggle(item.id, checked)}
                  />
                  <Thumbnail item={item} />
                  <div className='flex min-w-0 flex-1 flex-col gap-1.5'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <Link
                        className='leading-snug font-medium [overflow-wrap:anywhere] hover:underline'
                        params={{ id: item.id }}
                        to='/items/$id'
                      >
                        {label}
                      </Link>
                      <Origin origin={item.origin} />
                    </div>
                    {item.description && item.description !== label ? (
                      <p className='text-muted-foreground line-clamp-3 text-sm [overflow-wrap:anywhere]'>
                        {item.description}
                      </p>
                    ) : null}
                    {item.tags.length > 0 ? (
                      <ul aria-label='Tags' className='flex flex-wrap gap-1'>
                        {item.tags.map(tag => (
                          <li key={tag}>
                            <Badge variant='secondary'>{tag}</Badge>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {item.sourceUrl ? (
                      <a
                        className='text-muted-foreground w-fit truncate text-xs underline-offset-4 hover:underline'
                        href={item.sourceUrl}
                        rel='noopener noreferrer nofollow'
                        target='_blank'
                      >
                        {hostnameOf(item.sourceUrl)}
                      </a>
                    ) : null}
                    <div className='mt-1 flex flex-wrap gap-2'>
                      <Button
                        disabled={busy}
                        onClick={() => run('publish', [item.id])}
                        size='sm'
                      >
                        Publish
                      </Button>
                      <Link
                        className={buttonVariants({
                          size: 'sm',
                          variant: 'outline',
                        })}
                        // The form sits below the media on phones.
                        hash='edit'
                        params={{ id: item.id }}
                        search={{ edit: true }}
                        to='/items/$id'
                      >
                        Edit
                      </Link>
                      <Button
                        disabled={busy}
                        onClick={() => setDiscarding([item.id])}
                        size='sm'
                        variant='ghost'
                      >
                        Discard
                      </Button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>

          {count > items.length ? (
            <p className='text-muted-foreground py-6 text-center text-sm'>
              Showing the newest {items.length} of {count}. Publish or discard
              these to see the rest.
            </p>
          ) : null}
        </>
      )}

      <AlertDialog
        onOpenChange={open => {
          if (!(open || pending.current)) {
            setDiscarding(null)
            setError('')
          }
        }}
        open={discarding !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Discard {plural(discarding?.length ?? 0)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {discarding?.length === 1
                ? "Deletes the item and its image. Taste remembers the source so agents won't save it again."
                : "Deletes the items and their images. Taste remembers their sources so agents won't save them again."}{' '}
              You can undo that in Discarded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && discarding ? <p role='alert'>{error}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() => discarding && run('discard', discarding)}
              variant='destructive'
            >
              {busy ? 'Discarding…' : 'Discard'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
