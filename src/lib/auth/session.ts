import { env } from 'cloudflare:workers'
import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import {
  type Owner,
  ownerFromSession,
  UnauthorizedError,
} from '@/lib/auth/owner'
import { ensureAuthSchema, getAuth } from '@/lib/auth/server'

async function currentOwner(): Promise<Owner | null> {
  await ensureAuthSchema()
  const session = await getAuth().api.getSession({
    headers: getRequestHeaders(),
  })
  return ownerFromSession(session, env.OWNER_EMAIL)
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
