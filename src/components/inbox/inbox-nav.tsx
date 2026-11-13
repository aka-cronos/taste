import { Link } from '@tanstack/react-router'
import { buttonVariants } from '@/components/ui/button'

/** Switches between the inbox and what the owner discarded from it. */
export function InboxNav({ current }: { current: 'inbox' | 'discarded' }) {
  const link = (active: boolean) =>
    buttonVariants({ size: 'sm', variant: active ? 'secondary' : 'ghost' })
  return (
    <nav aria-label='Inbox views' className='flex gap-1'>
      <Link
        aria-current={current === 'inbox' ? 'page' : undefined}
        className={link(current === 'inbox')}
        to='/inbox'
      >
        Inbox
      </Link>
      <Link
        aria-current={current === 'discarded' ? 'page' : undefined}
        className={link(current === 'discarded')}
        to='/inbox/discarded'
      >
        Discarded
      </Link>
    </nav>
  )
}
