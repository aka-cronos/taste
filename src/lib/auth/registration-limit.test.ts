// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'
import { describe, expect, it, vi } from 'vitest'
import { createAuthOptions } from '@/lib/auth/options'

const ORIGIN = 'https://taste.example.com'

async function setup() {
  const database = new DatabaseSync(':memory:')
  const base = createAuthOptions({
    BETTER_AUTH_SECRET: 'test-secret-with-at-least-32-characters',
    BETTER_AUTH_URL: ORIGIN,
    DB: database as unknown as D1Database,
    GOOGLE_CLIENT_ID: 'test-client',
    GOOGLE_CLIENT_SECRET: 'test-secret',
    OWNER_EMAIL: 'owner@example.com',
  })
  const options = {
    ...base,
    database,
    plugins: base.plugins.filter(
      plugin => plugin.id !== 'tanstack-start-cookies',
    ),
  }
  const { runMigrations } = await getMigrations(options)
  await runMigrations()
  const createAuth = () => betterAuth(options)
  const register = (
    auth: ReturnType<typeof createAuth>,
    ip: string,
    forwardedIp = ip,
    malformed = false,
  ) =>
    auth.handler(
      new Request(`${ORIGIN}/api/auth/oauth2/register`, {
        body: JSON.stringify({
          client_name: malformed ? 123 : 'Test MCP',
          redirect_uris: ['https://client.example.com/callback'],
          token_endpoint_auth_method: 'none',
        }),
        headers: {
          'cf-connecting-ip': ip,
          'content-type': 'application/json',
          'x-forwarded-for': forwardedIp,
        },
        method: 'POST',
      }),
    )
  return { createAuth, database, register }
}

describe('persistent registration rate limit', () => {
  it('caps concurrent registration attempts across auth instances using the Cloudflare IP', async () => {
    const { database, createAuth, register } = await setup()
    const instances = [createAuth(), createAuth()] as const
    const responses = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        register(
          instances[index % 2] ?? instances[0],
          '203.0.113.10',
          `198.51.100.${index}`,
          true,
        ),
      ),
    )
    expect(responses.filter(response => response.status === 400)).toHaveLength(
      5,
    )
    expect(responses.filter(response => response.status === 429)).toHaveLength(
      7,
    )
    expect(
      database.prepare('SELECT count(*) AS count FROM oauthClient').get(),
    ).toEqual({ count: 0 })
    expect(database.prepare('SELECT count FROM rateLimit').get()).toEqual({
      count: 5,
    })
    expect(
      (await register(createAuth(), '203.0.113.10', '192.0.2.99')).status,
    ).toBe(429)
    expect((await register(createAuth(), '203.0.113.11')).status).toBe(201)
    database.close()
  })

  it('allows registration after the stored window expires', async () => {
    const { database, createAuth, register } = await setup()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now())
    try {
      const auth = createAuth()
      for (let index = 0; index < 5; index += 1) {
        // biome-ignore lint/performance/noAwaitInLoops: registrations share a single SQLite transaction connection
        expect((await register(auth, '203.0.113.10')).status).toBe(201)
      }
      const blocked = await register(createAuth(), '203.0.113.10')
      expect(blocked.status).toBe(429)
      expect(Number(blocked.headers.get('x-retry-after'))).toBeGreaterThan(0)
      clock.mockReturnValue(Date.now() + 61_000)
      expect((await register(createAuth(), '203.0.113.10')).status).toBe(201)
    } finally {
      clock.mockRestore()
      database.close()
    }
  })
})
