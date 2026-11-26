// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'
import { describe, expect, it } from 'vitest'
import { type AuthEnv, createAuthOptions } from '@/lib/auth/options'
import { ownerFromSession } from '@/lib/auth/owner'
import { testLoginPassword } from '@/lib/auth/test-login'

const OWNER = 'owner@example.com'
const PASSWORD = 'a-test-login-password-of-32-chars'
const LOCAL = 'http://localhost:3000'

const localEnv = {
  BETTER_AUTH_SECRET: 'test-secret-that-is-at-least-32-characters',
  BETTER_AUTH_URL: LOCAL,
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  OWNER_EMAIL: OWNER,
  TEST_LOGIN_PASSWORD: PASSWORD,
}

async function setup(overrides: Partial<AuthEnv> = {}) {
  const database = new DatabaseSync(':memory:')
  const env = {
    ...localEnv,
    ...overrides,
    DB: database as unknown as D1Database,
  } satisfies AuthEnv
  const base = createAuthOptions(env)
  const options = {
    ...base,
    database,
    logger: { disabled: true },
    // The TanStack cookie plugin needs a Start request; tests call the API directly.
    plugins: base.plugins.filter(
      plugin => plugin.id !== 'tanstack-start-cookies',
    ),
  }
  const { runMigrations } = await getMigrations(options)
  await runMigrations()
  const auth = betterAuth(options)
  const { origin } = new URL(env.BETTER_AUTH_URL)
  const signIn = (password: string) =>
    auth.handler(
      new Request(`${origin}/api/auth/test-login`, {
        body: JSON.stringify({ password }),
        headers: { 'content-type': 'application/json', origin },
        method: 'POST',
      }),
    )
  const count = (table: 'user' | 'session') =>
    (
      database.prepare(`SELECT count(*) AS n FROM ${table}`).get() as {
        n: number
      }
    ).n
  return { auth, count, database, env, signIn }
}

function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map(cookie => cookie.split(';')[0])
    .join('; ')
}

describe('testLoginPassword', () => {
  it.each([LOCAL, 'http://127.0.0.1:3007', 'http://localhost:51234'])(
    'is on for the loopback URL %s',
    url => {
      expect(testLoginPassword({ ...localEnv, BETTER_AUTH_URL: url })).toBe(
        PASSWORD,
      )
    },
  )

  it.each([
    ['a production URL', { BETTER_AUTH_URL: 'https://taste.akacronos.com' }],
    [
      'a Preview URL',
      { BETTER_AUTH_URL: 'https://auth-taste.example.workers.dev' },
    ],
    [
      'a host that only starts with localhost',
      {
        BETTER_AUTH_URL: 'http://localhost.example.com',
      },
    ],
    ['a malformed URL', { BETTER_AUTH_URL: 'localhost:3000' }],
    ['HTTPS on localhost', { BETTER_AUTH_URL: 'https://localhost:3000' }],
    ['a missing URL', { BETTER_AUTH_URL: undefined }],
    [
      'the Preview OAuth proxy',
      {
        OAUTH_PROXY_URL: 'https://auth-taste.example.workers.dev',
      },
    ],
    ['a missing password', { TEST_LOGIN_PASSWORD: undefined }],
    ['an empty password', { TEST_LOGIN_PASSWORD: '' }],
    ['a password under 24 characters', { TEST_LOGIN_PASSWORD: 'x'.repeat(23) }],
  ])('is off with %s', (_, overrides) => {
    expect(testLoginPassword({ ...localEnv, ...overrides })).toBeNull()
  })
})

describe('test login endpoint', () => {
  it('signs in as the owner with the right password', async () => {
    const { auth, count, env, signIn } = await setup()
    const response = await signIn(PASSWORD)
    expect(response.status).toBe(200)
    const session = await auth.api.getSession({
      headers: new Headers({ cookie: cookies(response) }),
    })
    expect(ownerFromSession(session, env.OWNER_EMAIL)).toMatchObject({
      email: OWNER,
    })
    expect(count('user')).toBe(1)
    expect(count('session')).toBe(1)
  })

  it('reuses the existing owner row', async () => {
    const { count, signIn } = await setup()
    expect((await signIn(PASSWORD)).status).toBe(200)
    expect((await signIn(PASSWORD)).status).toBe(200)
    expect(count('user')).toBe(1)
    expect(count('session')).toBe(2)
  })

  it('rejects a wrong password without creating anything', async () => {
    const { count, signIn } = await setup()
    const response = await signIn(`${PASSWORD}-wrong`)
    expect(response.status).toBe(401)
    expect(response.headers.getSetCookie()).toEqual([])
    expect(count('user')).toBe(0)
    expect(count('session')).toBe(0)
  })

  it('refuses to sign in without an owner address', async () => {
    const { count, signIn } = await setup({ OWNER_EMAIL: ' ' })
    expect((await signIn(PASSWORD)).status).toBe(403)
    expect(count('user')).toBe(0)
  })

  it('caps sign-in attempts', async () => {
    const { signIn } = await setup()
    const statuses: number[] = []
    for (let attempt = 0; attempt < 11; attempt += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: attempts must hit the limiter in order
      statuses.push((await signIn('wrong')).status)
    }
    expect(statuses.slice(0, 10)).toEqual(new Array(10).fill(401))
    expect(statuses[10]).toBe(429)
  })

  it.each([
    ['production', { BETTER_AUTH_URL: 'https://taste.example.com' }],
    ['no password', { TEST_LOGIN_PASSWORD: undefined }],
  ])('does not exist in %s', async (_, overrides) => {
    const { count, signIn } = await setup(overrides)
    expect((await signIn(PASSWORD)).status).toBe(404)
    expect(count('session')).toBe(0)
  })

  it('does not exist behind the Preview OAuth proxy', () => {
    const proxy = 'https://auth-taste.example.workers.dev'
    const options = createAuthOptions(
      {
        ...localEnv,
        AUTH_PREVIEW_HOST: '*-taste.example.workers.dev',
        BETTER_AUTH_URL: proxy,
        DB: {} as D1Database,
        OAUTH_PROXY_URL: proxy,
      },
      new Request(`${proxy}/api/auth/get-session`),
    )
    expect(options.plugins.map(plugin => plugin.id)).not.toContain('test-login')
  })
})
