import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import type { Owner } from '@/lib/auth/owner'
import { UnauthorizedError } from '@/lib/auth/owner'
import { ownerFromHeaders } from '@/lib/auth/request'

function currentOwner(): Promise<Owner | null> {
  return ownerFromHeaders(getRequestHeaders())
}

/** The signed-in owner, or null. Safe to call from anywhere. */
export const getOwner = createServerFn({ method: 'GET' }).handler(currentOwner)

/**
 * Guard for owner-only server functions. Rejects anonymous and non-owner
 * calls with a 401 and passes the owner on as `context.owner`:
 *
 * ```ts
 * createServerFn({ method: 'POST' })
 *   .middleware([requireOwner])
 *   .handler(({ context }) => context.owner.email)
 * ```
 */
export const requireOwner = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const owner = await currentOwner()
    if (!owner) {
      throw new UnauthorizedError()
    }
    return next({ context: { owner } })
  },
)
