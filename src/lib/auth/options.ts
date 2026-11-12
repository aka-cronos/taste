import type { BetterAuthOptions } from 'better-auth'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import {
  isOwnerEmail,
  NOT_AUTHORIZED,
  NOT_AUTHORIZED_MESSAGE,
} from '@/lib/auth/owner'

export type AuthEnv = Pick<
  Env,
  | 'BETTER_AUTH_SECRET'
  | 'BETTER_AUTH_URL'
  | 'DB'
  | 'GOOGLE_CLIENT_ID'
  | 'GOOGLE_CLIENT_SECRET'
  | 'OWNER_EMAIL'
>

export function createAuthOptions(env: AuthEnv) {
  return {
    appName: 'Taste',
    basePath: '/api/auth',
    baseURL: env.BETTER_AUTH_URL,
    database: env.DB,
    // Must stay last so it can set the cookies of the other plugins' responses.
    plugins: [tanstackStartCookies()],
    secret: env.BETTER_AUTH_SECRET,
    session: {
      // Reading the session from a signed cookie skips a D1 query on most
      // requests. Revocation takes effect within this window.
      cookieCache: { enabled: true, maxAge: 60 * 5 },
      // Keep the owner signed in for 30 days, refreshed daily while in use.
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        prompt: 'select_account',
      },
    },
    user: {
      // Runs before a user row is created and on every Google sign-in with the
      // fresh Google email, so any account other than the owner is turned away
      // without leaving a row behind.
      validateUserInfo: ({ user, source }) => {
        const verified = source.oauth?.profile?.email_verified
        if (verified === false || !isOwnerEmail(user.email, env.OWNER_EMAIL)) {
          return {
            error: NOT_AUTHORIZED,
            errorDescription: NOT_AUTHORIZED_MESSAGE,
          }
        }
      },
    },
  } satisfies BetterAuthOptions
}
