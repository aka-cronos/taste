// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'
import { describe, expect, it } from 'vitest'
import { type AuthEnv, createAuthOptions } from '@/lib/auth/options'
import { NOT_AUTHORIZED } from '@/lib/auth/owner'

const OWNER = 'owner@example.com'

// Runs the real Better Auth sign-in flow against an in-memory SQLite database.
// Google is stubbed: its ID token signature check is skipped, so an unsigned
// token carrying the claims stands in for a real one.
function googleIdToken(email: string, emailVerified = true) {
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url')
  const claims = {
    email,
    email_verified: emailVerified,
    name: 'Someone',
    sub: `google-${email}`,
  }
  return `${part({ alg: 'none' })}.${part(claims)}.signature`
}

async function setup() {
  const database = new DatabaseSync(':memory:')
  const env = {
    BETTER_AUTH_SECRET: 'test-secret-that-is-at-least-32-characters',
    BETTER_AUTH_URL: 'http://localhost:3000',
    DB: database as unknown as D1Database,
    GOOGLE_CLIENT_ID: 'client-id',
    GOOGLE_CLIENT_SECRET: 'client-secret',
    OWNER_EMAIL: ` ${OWNER.toUpperCase()} `,
  } satisfies AuthEnv
  const base = createAuthOptions(env)
  const options = {
    ...base,
    database,
    // The TanStack cookie plugin needs a Start request; tests call the API directly.
    plugins: [],
    socialProviders: {
      google: {
        ...base.socialProviders.google,
        verifyIdToken: async () => true,
      },
    },
  }
  const { runMigrations } = await getMigrations(options)
  await runMigrations()
  const auth = betterAuth(options)

  const signIn = (email: string, emailVerified?: boolean) =>
    auth.api.signInSocial({
      asResponse: true,
      body: {
        idToken: { token: googleIdToken(email, emailVerified) },
        provider: 'google',
      },
    })
  const userCount = () =>
    (database.prepare('SELECT count(*) AS n FROM user').get() as { n: number })
      .n

  return { signIn, userCount }
}

describe('owner-only sign-in', () => {
  it('lets the owner sign in and keeps one user row', async () => {
    const { signIn, userCount } = await setup()

    const first = await signIn(OWNER)
    expect(first.status).toBe(200)
    expect(first.headers.get('set-cookie')).toContain('session_token')

    expect((await signIn(OWNER)).status).toBe(200)
    expect(userCount()).toBe(1)
  })

  it('rejects any other Google account without creating a user', async () => {
    const { signIn, userCount } = await setup()

    const response = await signIn('intruder@example.com')
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: NOT_AUTHORIZED })
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(userCount()).toBe(0)
  })

  it('rejects the owner address when Google has not verified it', async () => {
    const { signIn, userCount } = await setup()

    expect((await signIn(OWNER, false)).status).toBe(403)
    expect(userCount()).toBe(0)
  })
})
