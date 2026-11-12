// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'
import { describe, expect, it, vi } from 'vitest'
import { type AuthEnv, createAuthOptions } from '@/lib/auth/options'

const PROXY = 'https://auth-taste.example.workers.dev'
const PREVIEW = 'https://feature-one-taste.example.workers.dev'
const OWNER = 'owner@example.com'
const previewEnv = {
  AUTH_PREVIEW_HOST: '*-taste.example.workers.dev',
  BETTER_AUTH_SECRET: 'preview-session-secret-at-least-32-characters',
  BETTER_AUTH_URL: PROXY,
  GOOGLE_CLIENT_ID: 'testing-client',
  GOOGLE_CLIENT_SECRET: 'testing-client-secret',
  OAUTH_PROXY_URL: PROXY,
  OWNER_EMAIL: OWNER,
}

async function setup() {
  const database = new DatabaseSync(':memory:')
  const base = createAuthOptions({
    ...previewEnv,
    DB: database as unknown as D1Database,
  })
  const options = {
    ...base,
    advanced: { disableCSRFCheck: false, disableOriginCheck: false },
    database,
    logger: { disabled: true },
    plugins: base.plugins.filter(
      plugin => plugin.id !== 'tanstack-start-cookies',
    ),
  }
  const { runMigrations } = await getMigrations(options)
  await runMigrations()
  const auth = betterAuth(options)
  const count = (table: 'user' | 'session') =>
    (
      database.prepare(`SELECT count(*) AS n FROM ${table}`).get() as {
        n: number
      }
    ).n
  return { auth, count }
}

function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map(cookie => cookie.split(';')[0])
    .join('; ')
}

async function begin(
  auth: Awaited<ReturnType<typeof setup>>['auth'],
  origin = PREVIEW,
  callbackURL = `${origin}/`,
) {
  return await auth.handler(
    new Request(`${origin}/api/auth/sign-in/social`, {
      body: JSON.stringify({
        callbackURL,
        disableRedirect: true,
        provider: 'google',
      }),
      headers: { 'content-type': 'application/json', origin },
      method: 'POST',
    }),
  )
}

describe('Preview OAuth proxy', () => {
  it.each([PREVIEW, 'https://another-branch-taste.example.workers.dev'])(
    'uses the same fixed Google callback from %s',
    async origin => {
      const { auth } = await setup()
      const response = await begin(auth, origin)
      expect(response.status).toBe(200)
      const result = (await response.json()) as { url: string }
      expect(new URL(result.url).searchParams.get('redirect_uri')).toBe(
        `${PROXY}/api/auth/callback/google`,
      )
    },
  )

  it.each([
    { allowed: true, email: OWNER, verified: true },
    { allowed: false, email: 'other@example.com', verified: true },
    { allowed: false, email: OWNER, verified: false },
  ])(
    'keeps the owner restriction through the proxy: $email, verified=$verified',
    async ({ email, verified, allowed }) => {
      const preview = await setup()
      const proxy = await setup()
      const start = await begin(preview.auth)
      const authorization = new URL(
        ((await start.json()) as { url: string }).url,
      )
      const provider = (await proxy.auth.$context).socialProviders.find(
        entry => entry.id === 'google',
      )
      if (!provider) {
        throw new Error('Missing Google provider')
      }
      vi.spyOn(provider, 'validateAuthorizationCode').mockResolvedValue({
        accessToken: 'test-access-token',
      })
      vi.spyOn(provider, 'getUserInfo').mockResolvedValue({
        data: { email, email_verified: verified, sub: 'google-owner' },
        user: {
          email,
          emailVerified: verified,
          name: 'Owner',
        },
      })
      const callback = new URL(`${PROXY}/api/auth/callback/google`)
      callback.searchParams.set('code', 'test-google-code')
      callback.searchParams.set(
        'state',
        authorization.searchParams.get('state') ?? '',
      )
      const exchange = await proxy.auth.handler(new Request(callback))
      expect(exchange.status).toBe(302)
      const completion = exchange.headers.get('location') ?? ''
      expect(
        completion.startsWith(
          `${PREVIEW}/api/auth/callback/google/oauth-proxy`,
        ),
      ).toBe(true)
      expect(proxy.count('user')).toBe(0)
      expect(proxy.count('session')).toBe(0)
      const completed = await preview.auth.handler(
        new Request(completion, { headers: { cookie: cookies(start) } }),
      )
      expect(completed.status).toBe(302)
      expect(preview.count('user')).toBe(allowed ? 1 : 0)
      expect(preview.count('session')).toBe(allowed ? 1 : 0)
      expect(
        completed.headers.get('set-cookie')?.includes('session_token') ?? false,
      ).toBe(allowed)
    },
  )

  it.each([
    'https://attacker.example/',
    'https://another-app.example.workers.dev/',
  ])('rejects a foreign completion callback: %s', async callbackURL => {
    const { auth } = await setup()
    const url = new URL(`${PREVIEW}/api/auth/callback/google/oauth-proxy`)
    url.searchParams.set('callbackURL', callbackURL)
    url.searchParams.set('profile', 'invalid-profile')
    const response = await auth.handler(new Request(url))
    expect(response.status).toBe(403)
  })

  it('leaves local and production auth on the direct Google flow', () => {
    const options = createAuthOptions({
      ...previewEnv,
      AUTH_PREVIEW_HOST: '',
      DB: {} as D1Database,
      OAUTH_PROXY_URL: '',
    })
    expect(options.baseURL).toBe(PROXY)
    expect(options.plugins.map(plugin => plugin.id)).not.toContain(
      'oauth-proxy',
    )
  })

  it('rejects an incomplete proxy configuration', () => {
    const env: AuthEnv = {
      ...previewEnv,
      AUTH_PREVIEW_HOST: '',
      DB: {} as D1Database,
    }
    expect(() => createAuthOptions(env)).toThrow(
      'Configure OAUTH_PROXY_URL and AUTH_PREVIEW_HOST together.',
    )
  })
})
