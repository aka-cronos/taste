// Error code Better Auth puts in the `error` query parameter when a Google
// account other than the owner tries to sign in.
export const NOT_AUTHORIZED = 'NOT_AUTHORIZED'

export const NOT_AUTHORIZED_MESSAGE =
  'This Google account is not authorized to sign in. Only the owner of this site can.'

/** The signed-in owner, as the UI sees it. */
export interface Owner {
  email: string
  image: string | null
  name: string
}

interface SessionUser {
  email: string
  image?: string | null
  name: string
}

/** Thrown by owner-only server functions; Start answers with a 401. */
export class UnauthorizedError extends Error {
  readonly status = 401

  constructor() {
    super('Sign in as the owner to do this.')
    this.name = 'UnauthorizedError'
  }
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

/**
 * True when `email` is the configured owner address. An empty or missing
 * owner address matches nobody, so a misconfigured install stays locked.
 */
export function isOwnerEmail(
  email: string | null | undefined,
  ownerEmail: string | null | undefined,
) {
  if (!(email && ownerEmail)) {
    return false
  }
  const owner = normalizeEmail(ownerEmail)
  return owner.length > 0 && normalizeEmail(email) === owner
}

/**
 * The owner behind a session, or null for anonymous visitors and for any
 * session whose user is not the current owner (for example after
 * `OWNER_EMAIL` changed).
 */
export function ownerFromSession(
  session: { user: SessionUser } | null | undefined,
  ownerEmail: string | null | undefined,
): Owner | null {
  if (!(session && isOwnerEmail(session.user.email, ownerEmail))) {
    return null
  }
  const { email, image, name } = session.user
  return { email, image: image ?? null, name }
}
