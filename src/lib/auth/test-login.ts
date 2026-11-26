import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthEndpoint } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import { constantTimeEqual } from 'better-auth/crypto'
import { z } from 'zod'
import { isLocalAuthURL } from '@/lib/auth/local'
import { normalizeEmail } from '@/lib/auth/owner'

/**
 * A password sign-in for the owner, for automated verification only. It never
 * exists in production or in Previews: see `testLoginPassword` for the gate.
 */

export const TEST_LOGIN_MIN_LENGTH = 24

export interface TestLoginEnv {
  BETTER_AUTH_URL?: string
  OAUTH_PROXY_URL?: string
  OWNER_EMAIL?: string
  TEST_LOGIN_PASSWORD?: string
}

/**
 * The test login password when the test login is on, or null. It is on only
 * when every condition holds, so any missing or odd value keeps it off:
 *
 * - the auth base URL is plain HTTP on a loopback host (local dev and CI);
 * - no Preview OAuth proxy is configured;
 * - the password is at least `TEST_LOGIN_MIN_LENGTH` characters long.
 */
export function testLoginPassword(env: TestLoginEnv): string | null {
  const password = env.TEST_LOGIN_PASSWORD ?? ''
  if (
    password.length < TEST_LOGIN_MIN_LENGTH ||
    env.OAUTH_PROXY_URL?.trim() ||
    !isLocalAuthURL(env.BETTER_AUTH_URL)
  ) {
    return null
  }
  return password
}

/** The test login plugin, or nothing when the test login is off. */
export function testLoginPlugins(env: TestLoginEnv): BetterAuthPlugin[] {
  const password = testLoginPassword(env)
  return password ? [testLogin(password, env.OWNER_EMAIL ?? '')] : []
}

function testLogin(password: string, ownerEmail: string) {
  return {
    endpoints: {
      testLogin: createAuthEndpoint(
        '/test-login',
        {
          body: z.object({ password: z.string() }),
          method: 'POST',
        },
        async ctx => {
          if (!constantTimeEqual(ctx.body.password, password)) {
            throw new APIError('UNAUTHORIZED', {
              message: 'Wrong test login password.',
            })
          }
          const email = normalizeEmail(ownerEmail)
          if (!email) {
            throw new APIError('FORBIDDEN', {
              message: 'Set OWNER_EMAIL to use the test login.',
            })
          }
          const found = await ctx.context.internalAdapter.findUserByEmail(email)
          // A new row still goes through `validateUserInfo`, the owner gate.
          const user =
            found?.user ??
            (await ctx.context.internalAdapter.createUser(
              { email, emailVerified: true, name: 'Test owner' },
              { method: 'test-login' },
            ))
          const session = await ctx.context.internalAdapter.createSession(
            user.id,
          )
          await setSessionCookie(ctx, { session, user })
          return ctx.json({ ok: true })
        },
      ),
    },
    id: 'test-login',
    rateLimit: [
      { max: 10, pathMatcher: path => path === '/test-login', window: 60 },
    ],
  } satisfies BetterAuthPlugin
}
