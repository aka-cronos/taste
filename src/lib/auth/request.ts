import { env } from 'cloudflare:workers'
import { type Owner, ownerFromSession } from '@/lib/auth/owner'
import { ensureAuthSchema, getAuth } from '@/lib/auth/server'

/** The owner behind a request's session cookie, or null. Server only. */
export async function ownerFromHeaders(
  headers: Headers,
): Promise<Owner | null> {
  await ensureAuthSchema()
  const session = await getAuth().api.getSession({ headers })
  return ownerFromSession(session, env.OWNER_EMAIL)
}
