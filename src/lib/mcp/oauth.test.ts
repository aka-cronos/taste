// @vitest-environment node
import { createHash } from 'node:crypto'
import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'
import { describe, expect, it, vi } from 'vitest'
import { createAuthOptions } from '@/lib/auth/options'
import { protectedMcp } from '@/lib/mcp/handler'
import { fetchClientMetadataResource } from '@/lib/mcp/metadata-fetch'
import { createTestD1 } from '@/test/d1'
import { insertItem } from '@/test/items'

vi.mock('@/lib/mcp/metadata-fetch', () => ({
  fetchClientMetadataResource: vi.fn(),
}))
const ORIGIN = 'https://taste.example.com'
const OWNER = 'owner@example.com'

async function setup() {
  const { db, sqlite } = createTestD1()
  const base = createAuthOptions({
    BETTER_AUTH_SECRET: 'test-secret-with-at-least-32-characters',
    BETTER_AUTH_URL: ORIGIN,
    DB: db,
    GOOGLE_CLIENT_ID: 'client',
    GOOGLE_CLIENT_SECRET: 'secret',
    OWNER_EMAIL: OWNER,
  })
  const options = {
    ...base,
    database: sqlite,
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
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url')
  const signedIn = await auth.api.signInSocial({
    asResponse: true,
    body: {
      idToken: {
        token: `${part({ alg: 'none' })}.${part({ email: OWNER, email_verified: true, name: 'Owner', sub: 'google-owner' })}.signature`,
      },
      provider: 'google',
    },
  })
  const cookie = signedIn.headers
    .getSetCookie()
    .map(value => value.split(';')[0])
    .join('; ')
  const headers = new Headers({ cookie, origin: ORIGIN })
  const client = await auth.api.createOAuthClient({
    body: {
      client_name: 'Test MCP',
      redirect_uris: ['https://client.example.com/callback'],
      scope: 'mcp:read offline_access',
      token_endpoint_auth_method: 'none',
    },
    headers,
  })
  const handle = protectedMcp(auth, db, OWNER, ORIGIN)
  return { auth, client, db, handle, headers, sqlite }
}

async function tokenFor(state: Awaited<ReturnType<typeof setup>>) {
  const verifier = 'test-code-verifier-that-is-long-enough-for-pkce-12345'
  const query = new URLSearchParams({
    client_id: state.client.client_id,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    redirect_uri: 'https://client.example.com/callback',
    resource: `${ORIGIN}/mcp`,
    response_type: 'code',
    scope: 'mcp:read offline_access',
    state: 'client-state',
  })
  const response = await state.auth.handler(
    new Request(`${ORIGIN}/api/auth/oauth2/authorize?${query}`, {
      headers: state.headers,
    }),
  )
  expect(response.status).toBe(302)
  const consent = new URL(response.headers.get('location') ?? '', ORIGIN)
  const approval = await state.auth.api.oauth2Consent({
    body: { accept: true, oauth_query: consent.search.slice(1) },
    headers: state.headers,
  })
  const code = new URL(approval.url).searchParams.get('code')
  const exchange = await state.auth.handler(
    new Request(`${ORIGIN}/api/auth/oauth2/token`, {
      body: new URLSearchParams({
        client_id: state.client.client_id,
        code: code ?? '',
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: 'https://client.example.com/callback',
        resource: `${ORIGIN}/mcp`,
      }),
      method: 'POST',
    }),
  )
  expect(exchange.status).toBe(200)
  return (await exchange.json()) as {
    access_token: string
    refresh_token: string
  }
}

function rpc(
  token: string,
  method: string,
  params: { name?: string; arguments?: object } = {},
) {
  return new Request(`${ORIGIN}/mcp`, {
    body: JSON.stringify({
      id: 1,
      jsonrpc: '2.0',
      method,
      params: {
        ...params,
        _meta: {
          'io.modelcontextprotocol/clientCapabilities': {},
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        },
      },
    }),
    headers: {
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'MCP-Protocol-Version': '2026-07-28',
      'Mcp-Method': method,
      ...(params.name ? { 'Mcp-Name': params.name } : {}),
    },
    method: 'POST',
  })
}

describe('private MCP OAuth', () => {
  it('challenges anonymous calls and serves both discovery documents with DCR off', async () => {
    const { auth, handle } = await setup()
    const response = await handle(
      new Request(`${ORIGIN}/mcp`, { method: 'POST' }),
    )
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toContain(
      `resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"`,
    )
    const metadata = await auth.handler(
      new Request(`${ORIGIN}/.well-known/oauth-protected-resource/mcp`),
    )
    expect(await metadata.json()).toMatchObject({
      authorization_servers: [`${ORIGIN}/api/auth`],
      resource: `${ORIGIN}/mcp`,
    })
    const discovery = await auth.handler(
      new Request(`${ORIGIN}/.well-known/oauth-authorization-server/api/auth`),
    )
    const document = (await discovery.json()) as {
      client_id_metadata_document_supported: boolean
      registration_endpoint?: string
    }
    expect(document.client_id_metadata_document_supported).toBe(true)
    expect(document.registration_endpoint).toBeUndefined()
  })
  it('completes PKCE consent and calls all three tools with private search and absolute images', async () => {
    const state = await setup()
    insertItem(state.sqlite, {
      description: 'Brutalist poster',
      id: 'private',
      status: 'inbox',
      tags: ['warm', 'poster'],
      type: 'image',
    })
    insertItem(state.sqlite, { id: 'public', tags: ['warm'] })
    const tokens = await tokenFor(state)
    const list = await state.handle(rpc(tokens.access_token, 'tools/list'))
    expect(list.status, await list.clone().text()).toBe(200)
    expect(
      (
        (await list.json()) as { result: { tools: { name: string }[] } }
      ).result.tools
        .map((tool: { name: string }) => tool.name)
        .sort(),
    ).toEqual(['get_item', 'list_tags', 'search_items'])
    for (const [name, args] of [
      [
        'search_items',
        {
          q: 'brutalist',
          status: 'inbox',
          tags: ['warm', 'poster'],
          type: 'image',
        },
      ],
      ['get_item', { id: 'private' }],
      ['list_tags', {}],
    ] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: verify each tool response
      const response = await state.handle(
        rpc(tokens.access_token, 'tools/call', { arguments: args, name }),
      )
      const payload = (
        (await response.json()) as {
          result: { isError?: boolean; content: { text: string }[] }
        }
      ).result
      expect(payload.isError).not.toBe(true)
      expect(payload.content[0]?.text).toContain(
        name === 'list_tags' ? '"count":2' : `${ORIGIN}/media/`,
      )
    }
    state.sqlite
      .prepare('UPDATE user SET email = ?')
      .run('former-owner@example.com')
    expect(
      (await state.handle(rpc(tokens.access_token, 'tools/list'))).status,
    ).toBe(403)
  })
  it('discovers a CIMD client and starts owner consent without DCR', async () => {
    const state = await setup()
    const clientId = 'https://client.example.com/metadata.json'
    vi.mocked(fetchClientMetadataResource).mockResolvedValue(
      Response.json({
        client_id: clientId,
        client_name: 'CIMD client',
        redirect_uris: ['https://client.example.com/callback'],
        token_endpoint_auth_method: 'none',
      }),
    )
    const query = new URLSearchParams({
      client_id: clientId,
      code_challenge: createHash('sha256')
        .update('a'.repeat(43))
        .digest('base64url'),
      code_challenge_method: 'S256',
      redirect_uri: 'https://client.example.com/callback',
      resource: `${ORIGIN}/mcp`,
      response_type: 'code',
      scope: 'mcp:read',
    })
    const response = await state.auth.handler(
      new Request(`${ORIGIN}/api/auth/oauth2/authorize?${query}`, {
        headers: state.headers,
      }),
    )
    expect(response.status).toBe(302)
    expect(
      new URL(response.headers.get('location') ?? '', ORIGIN).pathname,
    ).toBe('/mcp/authorize')
    expect(fetchClientMetadataResource).toHaveBeenCalled()
  })
  it('rejects invalid signatures, wrong audiences, session tokens and missing scope', async () => {
    const state = await setup()
    const user = state.sqlite.prepare('SELECT id FROM user').get() as {
      id: string
    }
    const payload = {
      aud: `${ORIGIN}/mcp`,
      azp: state.client.client_id,
      exp: Math.floor(Date.now() / 1000) + 300,
      iss: `${ORIGIN}/api/auth`,
      scope: 'mcp:read',
      sub: user.id,
    }
    for (const [overrides, status] of [
      [{ aud: 'https://another.example/mcp' }, 401],
      [{ azp: undefined }, 401],
      [{ scope: '' }, 403],
      [{ exp: 1 }, 401],
    ] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: verify each independently signed invalid token
      const signed = await state.auth.api.signJWT({
        body: { payload: { ...payload, ...overrides } },
      })
      expect((await state.handle(rpc(signed.token, 'tools/list'))).status).toBe(
        status,
      )
    }
    expect(
      (await state.handle(rpc('invalid.token.signature', 'tools/list'))).status,
    ).toBe(401)
  })
  it('rejects a signed-in non-owner at consent and authorization', async () => {
    const state = await setup()
    state.sqlite
      .prepare('UPDATE user SET email = ?')
      .run('intruder@example.com')
    for (const path of ['consent', 'authorize']) {
      // biome-ignore lint/performance/noAwaitInLoops: verify both protected entry points
      const response = await state.auth.handler(
        new Request(
          `${ORIGIN}/api/auth/oauth2/${path}?client_id=${state.client.client_id}&response_type=code&redirect_uri=https%3A%2F%2Fclient.example.com%2Fcallback`,
          {
            headers: state.headers,
            ...(path === 'consent'
              ? {
                  body: JSON.stringify({ accept: true }),
                  headers: new Headers({
                    ...Object.fromEntries(state.headers),
                    'content-type': 'application/json',
                  }),
                  method: 'POST',
                }
              : {}),
          },
        ),
      )
      expect(response.status).toBe(403)
    }
  })
})
