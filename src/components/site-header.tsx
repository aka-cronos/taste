import { Link } from '@tanstack/react-router'
import { InboxIcon, LogInIcon, LogOutIcon } from 'lucide-react'
import { useState } from 'react'
import { ThemeToggle } from '@/components/theme-toggle'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import type { Owner } from '@/lib/auth/owner'

interface SiteHeaderProps {
  /** Message from a rejected sign-in, shown under the header. */
  authError?: string | null
  /** Items waiting in the owner's inbox. */
  inboxCount?: number
  onSignIn: () => Promise<unknown>
  onSignOut: () => Promise<unknown>
  owner: Owner | null
}

export function SiteHeader({
  authError,
  inboxCount = 0,
  onSignIn,
  onSignOut,
  owner,
}: SiteHeaderProps) {
  const [pending, setPending] = useState(false)

  const run = async (action: () => Promise<unknown>) => {
    setPending(true)
    try {
      await action()
    } finally {
      setPending(false)
    }
  }

  return (
    <header className='border-b'>
      <div className='mx-auto flex h-14 max-w-6xl items-center gap-2 px-4'>
        <Link
          className='font-heading mr-auto text-lg font-semibold tracking-tight'
          to='/'
        >
          Taste
        </Link>
        {owner ? (
          <>
            <Link
              aria-label={`Inbox, ${inboxCount} ${inboxCount === 1 ? 'item' : 'items'}`}
              className={buttonVariants({ variant: 'ghost' })}
              to='/inbox'
            >
              <InboxIcon />
              Inbox
              {inboxCount > 0 ? (
                <Badge aria-hidden className='tabular-nums'>
                  {inboxCount}
                </Badge>
              ) : null}
            </Link>
            <span className='text-muted-foreground hidden text-sm sm:inline'>
              {owner.name || owner.email}
            </span>
            <Button
              disabled={pending}
              onClick={() => run(onSignOut)}
              variant='ghost'
            >
              <LogOutIcon />
              Sign out
            </Button>
          </>
        ) : (
          <Button
            disabled={pending}
            onClick={() => run(onSignIn)}
            variant='ghost'
          >
            <LogInIcon />
            Sign in
          </Button>
        )}
        <ThemeToggle />
      </div>
      {authError ? (
        <p
          className='bg-destructive/10 text-destructive px-4 py-2 text-center text-sm'
          role='alert'
        >
          {authError}
        </p>
      ) : null}
    </header>
  )
}
