// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'
import { describe, expect, it } from 'vitest'
import {
  type AuthEnv,
  bindsAuthToRequest,
  createAuthOptions,
} from '@/lib/auth/options'

const AUTH_URL = 'http://localhost:3000'
const OWNER = 'owner@example.com'
const RANDOM_PORT = 40_000 + Math.floor(Math.random() * 20_000)
const localEnv = {
  BETTER_AUTH_SECRET: 'local-session-secret-at-least-32-characters',
  BETTER_AUTH_URL: AUTH_URL,
  GOOGLE_CLIENT_ID: 'testing-client',
  GOOGLE_CLIENT_SECRET: 'testing-client-secret',
  OWNER_EMAIL: OWNER,
}

function optionsFor(origin: string, env: Partial<AuthEnv> = {}) {
  return createAuthOptions(
    { ...localEnv, DB: {} as D1Database, ...env },
    new Request(`${origin}/api/auth/get-session`),
  )
}

function idToken(email: string) {
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${part({ alg: 'none' })}.${part({ email, email_verified: true, name: 'Owner', sub: 'google-owner' })}.signature`
}

// Better Auth skips the origin check under test unless it is turned on.
async function setup(origin: string) {
  const database = new DatabaseSync(':memory:')
  const base = createAuthOptions(
    { ...localEnv, DB: database as unknown as D1Database },
    new Request(`${origin}/api/auth/get-session`),
  )
  const options = {
    ...base,
    advanced: {
      ...base.advanced,
      disableCSRFCheck: false,
      disableOriginCheck: false,
    },
    database,
    logger: { disabled: true },
    plugins: base.plugins.filter(
      plugin => plugin.id !== 'tanstack-start-cookies',
    ),
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
  const signedIn = await auth.api.signInSocial({
    asResponse: true,
    body: { idToken: { token: idToken(OWNER) }, provider: 'google' },
  })
  const cookie = signedIn.headers
    .getSetCookie()
    .map(value => value.split(';')[0])
    .join('; ')
  return { auth, cookie }
}

describe('local sign-in origin', () => {
  it.each([
    'http://localhost:3000',
    'http://localhost:3001',
    `http://127.0.0.1:${RANDOM_PORT}`,
  ])('uses the request origin %s as the base URL', origin => {
    expect(optionsFor(origin).baseURL).toBe(origin)
  })

  it.each([
    'http://evil.example',
    'http://localhost.evil.example',
    'http://127.0.0.1.evil.example:3000',
    'http://localhost',
    'http://[::1]:3001',
  ])('falls back to BETTER_AUTH_URL for %s', origin => {
    expect(optionsFor(origin).baseURL).toBe(AUTH_URL)
  })

  it.each([
    ['http://localhost:3001', 'http://localhost:3001'],
    [`http://127.0.0.1:${RANDOM_PORT}`, `http://127.0.0.1:${RANDOM_PORT}`],
    ['http://localhost.evil.example', AUTH_URL],
  ])('serves MCP resource metadata on %s as %s', async (origin, expected) => {
    const { auth } = await setup(origin)
    const response = await auth.handler(
      new Request(`${origin}/.well-known/oauth-protected-resource/mcp`),
    )
    expect(await response.json()).toMatchObject({
      authorization_servers: [`${expected}/api/auth`],
      resource: `${expected}/mcp`,
    })
  })

  it('falls back when the Host header is not a loopback host', () => {
    const options = createAuthOptions(
      { ...localEnv, DB: {} as D1Database },
      new Request('http://localhost:3001/api/auth/get-session', {
        headers: { host: 'localhost:3001.evil.example' },
      }),
    )
    expect(options.baseURL).toBe(AUTH_URL)
  })

  it.each(['https://taste.akacronos.com', 'https://localhost:3000'])(
    'stays off when BETTER_AUTH_URL is %s',
    authURL => {
      const options = optionsFor('http://localhost:3001', {
        BETTER_AUTH_URL: authURL,
      })
      expect(options.baseURL).toBe(authURL)
      expect(
        bindsAuthToRequest({
          ...localEnv,
          BETTER_AUTH_URL: authURL,
          DB: {} as D1Database,
        }),
      ).toBe(false)
    },
  )

  it('builds auth per request for a loopback BETTER_AUTH_URL', () => {
    for (const authURL of [AUTH_URL, 'http://127.0.0.1:3005']) {
      expect(
        bindsAuthToRequest({
          ...localEnv,
          BETTER_AUTH_URL: authURL,
          DB: {} as D1Database,
        }),
      ).toBe(true)
    }
  })

  it.each(['http://localhost:3001', `http://127.0.0.1:${RANDOM_PORT}`])(
    'accepts a cookie POST from its own origin %s',
    async origin => {
      const { auth, cookie } = await setup(origin)
      const response = await auth.handler(
        new Request(`${origin}/api/auth/sign-out`, {
          headers: { cookie, origin },
          method: 'POST',
        }),
      )
      expect(response.status, await response.clone().text()).toBe(200)
    },
  )

  it.each([
    ['http://localhost:3001', 'http://localhost:3000'],
    ['http://localhost:3001', 'http://localhost:3002'],
    [`http://127.0.0.1:${RANDOM_PORT}`, 'http://127.0.0.1:3000'],
  ])(
    'rejects a cookie POST to %s from loopback origin %s',
    async (origin, foreign) => {
      const { auth, cookie } = await setup(origin)
      const response = await auth.handler(
        new Request(`${origin}/api/auth/sign-out`, {
          headers: { cookie, origin: foreign },
          method: 'POST',
        }),
      )
      expect(response.status).toBe(403)
      expect(await response.json()).toMatchObject({ code: 'INVALID_ORIGIN' })
    },
  )

  it('sends Google back to the port that started sign-in', async () => {
    const origin = 'http://localhost:3001'
    const { auth } = await setup(origin)
    const response = await auth.handler(
      new Request(`${origin}/api/auth/sign-in/social`, {
        body: JSON.stringify({
          callbackURL: `${origin}/`,
          disableRedirect: true,
          provider: 'google',
        }),
        headers: { 'content-type': 'application/json', origin },
        method: 'POST',
      }),
    )
    expect(response.status, await response.clone().text()).toBe(200)
    const { url } = (await response.json()) as { url: string }
    expect(new URL(url).searchParams.get('redirect_uri')).toBe(
      `${origin}/api/auth/callback/google`,
    )
  })
})
