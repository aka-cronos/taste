import type { BetterAuthOptions } from 'better-auth'
import { oAuthProxy } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import {
  isOwnerEmail,
  NOT_AUTHORIZED,
  NOT_AUTHORIZED_MESSAGE,
} from '@/lib/auth/owner'

const PREVIEW_HOST = /^(?:\*-)?[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/u

export type AuthEnv = Pick<
  Env,
  | 'BETTER_AUTH_SECRET'
  | 'BETTER_AUTH_URL'
  | 'DB'
  | 'GOOGLE_CLIENT_ID'
  | 'GOOGLE_CLIENT_SECRET'
  | 'OWNER_EMAIL'
> &
  Partial<
    Record<keyof Pick<Env, 'OAUTH_PROXY_URL' | 'AUTH_PREVIEW_HOST'>, string>
  >

export function createAuthOptions(env: AuthEnv) {
  const proxyUrl = env.OAUTH_PROXY_URL?.trim()
  const previewHost = env.AUTH_PREVIEW_HOST?.trim()
  if (Boolean(proxyUrl) !== Boolean(previewHost)) {
    throw new Error('Configure OAUTH_PROXY_URL and AUTH_PREVIEW_HOST together.')
  }
  if (proxyUrl && previewHost) {
    const url = new URL(proxyUrl)
    if (
      url.protocol !== 'https:' ||
      url.origin !== proxyUrl ||
      !PREVIEW_HOST.test(previewHost)
    ) {
      throw new Error(
        'Use an HTTPS proxy origin and a workers.dev Preview host pattern.',
      )
    }
    return {
      ...baseAuthOptions(env),
      baseURL: {
        allowedHosts: [url.host, previewHost],
        protocol: 'https' as const,
      },
      plugins: [
        oAuthProxy({ productionURL: proxyUrl, secret: env.BETTER_AUTH_SECRET }),
        tanstackStartCookies(),
      ],
    } satisfies BetterAuthOptions
  }
  return baseAuthOptions(env)
}

function baseAuthOptions(env: AuthEnv) {
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
