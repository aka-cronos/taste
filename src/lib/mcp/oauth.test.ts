// @vitest-environment node
import { createHash } from 'node:crypto'
import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'
import { describe, expect, it, vi } from 'vitest'
import { toIssuerDiscovery } from '@/lib/auth/discovery'
import { createAuthOptions } from '@/lib/auth/options'
import { protectedMcp } from '@/lib/mcp/handler'
import { createTestD1 } from '@/test/d1'
import { insertItem } from '@/test/items'

const ORIGIN = 'https://taste.example.com'
const OWNER = 'owner@example.com'
const CHALLENGE_SCOPE = /scope="(?<scope>[^"]+)"/u

async function setup(origin = ORIGIN, preview = false, write = false) {
  const { db, sqlite } = createTestD1()
  const scope = write
    ? 'mcp:read mcp:write offline_access'
    : 'mcp:read offline_access'
  const bucket = {
    delete: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue({}),
  }
  const base = createAuthOptions(
    {
      ...(preview
        ? {
            AUTH_PREVIEW_HOST: '*-taste.example.workers.dev',
            OAUTH_PROXY_URL: 'https://auth-taste.example.workers.dev',
          }
        : {}),
      BETTER_AUTH_SECRET: 'test-secret-with-at-least-32-characters',
      BETTER_AUTH_URL: preview
        ? 'https://auth-taste.example.workers.dev'
        : ORIGIN,
      DB: db,
      GOOGLE_CLIENT_ID: 'client',
      GOOGLE_CLIENT_SECRET: 'secret',
      OWNER_EMAIL: OWNER,
    },
    new Request(`${origin}/api/auth/get-session`),
  )
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
  const headers = new Headers({ cookie, origin })
  const registration = await auth.handler(
    new Request(`${origin}/api/auth/oauth2/register`, {
      body: JSON.stringify({
        client_name: 'Test MCP',
        redirect_uris: ['https://client.example.com/callback'],
        scope,
        token_endpoint_auth_method: 'none',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }),
  )
  expect(registration.status, await registration.clone().text()).toBe(201)
  const client = (await registration.json()) as { client_id: string }
  const handle = protectedMcp(auth, db, OWNER, origin, bucket)
  return { auth, bucket, client, db, handle, headers, origin, scope, sqlite }
}

async function tokenFor(state: Awaited<ReturnType<typeof setup>>) {
  const verifier = 'test-code-verifier-that-is-long-enough-for-pkce-12345'
  const query = new URLSearchParams({
    client_id: state.client.client_id,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    redirect_uri: 'https://client.example.com/callback',
    resource: `${state.origin}/mcp`,
    response_type: 'code',
    scope: state.scope,
    state: 'client-state',
  })
  const response = await state.auth.handler(
    new Request(`${state.origin}/api/auth/oauth2/authorize?${query}`, {
      headers: state.headers,
    }),
  )
  expect(response.status).toBe(302)
  const consent = new URL(response.headers.get('location') ?? '', state.origin)
  expect(consent.pathname).toBe('/mcp/authorize')
  expect(consent.searchParams.get('scope')).toBe(state.scope)
  const approval = await state.auth.api.oauth2Consent({
    body: { accept: true, oauth_query: consent.search.slice(1) },
    headers: state.headers,
  })
  const code = new URL(approval.url).searchParams.get('code')
  const exchange = await state.auth.handler(
    new Request(`${state.origin}/api/auth/oauth2/token`, {
      body: new URLSearchParams({
        client_id: state.client.client_id,
        code: code ?? '',
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: 'https://client.example.com/callback',
        resource: `${state.origin}/mcp`,
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
  origin = ORIGIN,
) {
  return new Request(`${origin}/mcp`, {
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
  it('challenges anonymous calls and serves both discovery documents with DCR enabled and CIMD absent', async () => {
    const { auth, handle } = await setup()
    const response = await handle(
      new Request(`${ORIGIN}/mcp`, { method: 'POST' }),
    )
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toContain(
      `resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"`,
    )
    expect(response.headers.get('www-authenticate')).toContain(
      'scope="mcp:read mcp:write"',
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
    expect(document.client_id_metadata_document_supported).not.toBe(true)
    expect(document.registration_endpoint).toBe(
      `${ORIGIN}/api/auth/oauth2/register`,
    )
  })
  it.each([
    '/.well-known/oauth-authorization-server',
    '/.well-known/openid-configuration',
    '/.well-known/openid-configuration/api/auth',
  ])('serves issuer discovery at root alias %s', async path => {
    const { auth } = await setup()
    const response = await auth.handler(
      toIssuerDiscovery(new Request(`${ORIGIN}${path}`)),
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      issuer: `${ORIGIN}/api/auth`,
      registration_endpoint: `${ORIGIN}/api/auth/oauth2/register`,
    })
  })
  it('requests write consent through the default client connection flow', async () => {
    const state = await setup()
    const challenge = await state.handle(
      new Request(`${ORIGIN}/mcp`, { method: 'POST' }),
    )
    const scope = challenge.headers
      .get('www-authenticate')
      ?.match(CHALLENGE_SCOPE)?.groups?.scope
    expect(scope).toBe('mcp:read mcp:write')
    const registration = await state.auth.handler(
      new Request(`${ORIGIN}/api/auth/oauth2/register`, {
        body: JSON.stringify({
          client_name: 'Default MCP',
          redirect_uris: ['https://client.example.com/callback'],
          token_endpoint_auth_method: 'none',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
    )
    expect(registration.status).toBe(201)
    const client = (await registration.json()) as {
      client_id: string
      scope: string
    }
    expect(client.scope.split(' ').sort()).toEqual([
      'mcp:read',
      'mcp:write',
      'offline_access',
    ])
    const tokens = await tokenFor({ ...state, client, scope: scope ?? '' })
    const list = await state.handle(rpc(tokens.access_token, 'tools/list'))
    expect(list.status).toBe(200)
    expect(
      (
        (await list.json()) as { result: { tools: { name: string }[] } }
      ).result.tools
        .map(tool => tool.name)
        .sort(),
    ).toEqual([
      'get_item',
      'list_tags',
      'save_item',
      'search_items',
      'update_item',
    ])
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
  it('serves the legacy handshake and all read tools behind the same OAuth boundary', async () => {
    const state = await setup()
    insertItem(state.sqlite, {
      id: 'legacy-inbox',
      status: 'inbox',
      tags: ['warm'],
      type: 'image',
    })
    const tokens = await tokenFor(state)
    const legacyRequest = (
      method: string,
      params: object = {},
      notification = false,
    ) =>
      new Request(`${ORIGIN}/mcp`, {
        body: JSON.stringify({
          jsonrpc: '2.0',
          ...(notification ? {} : { id: 1 }),
          method,
          params,
        }),
        headers: {
          accept: 'application/json, text/event-stream',
          authorization: `Bearer ${tokens.access_token}`,
          'content-type': 'application/json',
          ...(method === 'initialize'
            ? {}
            : { 'MCP-Protocol-Version': '2025-11-25' }),
        },
        method: 'POST',
      })
    const readResult = async (response: Response) => {
      expect(response.status).toBe(200)
      expect(response.headers.has('mcp-session-id')).toBe(false)
      const text = await response.text()
      const data = response.headers
        .get('content-type')
        ?.includes('text/event-stream')
        ? text
            .split('\n')
            .find(line => line.startsWith('data: '))
            ?.slice(6)
        : text
      return JSON.parse(data ?? '') as {
        result: {
          protocolVersion?: string
          tools?: { name: string }[]
          isError?: boolean
          content?: { text: string }[]
        }
      }
    }
    const initialization = await readResult(
      await state.handle(
        legacyRequest('initialize', {
          capabilities: {},
          clientInfo: { name: 'Claude-compatible client', version: '1.0.0' },
          protocolVersion: '2025-11-25',
        }),
      ),
    )
    expect(initialization.result.protocolVersion).toBe('2025-11-25')
    expect(
      (await state.handle(legacyRequest('notifications/initialized', {}, true)))
        .status,
    ).toBe(202)
    const listed = await readResult(
      await state.handle(legacyRequest('tools/list')),
    )
    expect(listed.result.tools?.map(tool => tool.name).sort()).toEqual([
      'get_item',
      'list_tags',
      'search_items',
    ])
    for (const [name, args] of [
      ['list_tags', {}],
      ['search_items', { status: 'inbox' }],
      ['get_item', { id: 'legacy-inbox' }],
    ] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: exercise each legacy tool request separately
      const response = await state.handle(
        legacyRequest('tools/call', { arguments: args, name }),
      )
      const payload = await readResult(response)
      expect(payload.result.isError).not.toBe(true)
      expect(payload.result.content?.[0]?.text).toContain(
        name === 'list_tags' ? 'warm' : `${ORIGIN}/media/`,
      )
    }
    const anonymous = legacyRequest('initialize', {
      capabilities: {},
      clientInfo: { name: 'Anonymous', version: '1' },
      protocolVersion: '2025-11-25',
    })
    anonymous.headers.delete('authorization')
    expect((await state.handle(anonymous)).status).toBe(401)
    state.sqlite
      .prepare('UPDATE user SET email = ?')
      .run('former-owner@example.com')
    expect((await state.handle(legacyRequest('tools/list'))).status).toBe(403)
  })
  it('does not fetch URL-shaped client identifiers or allow unsupported scopes', async () => {
    const state = await setup()
    const network = vi.spyOn(globalThis, 'fetch')
    try {
      const query = new URLSearchParams({
        client_id: 'https://claude.ai/oauth/mcp-oauth-client-metadata',
        code_challenge: 'a'.repeat(43),
        code_challenge_method: 'S256',
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        response_type: 'code',
        scope: 'mcp:read',
      })
      const response = await state.auth.handler(
        new Request(`${ORIGIN}/api/auth/oauth2/authorize?${query}`),
      )
      expect(response.status).toBe(302)
      expect(
        new URL(response.headers.get('location') ?? '').searchParams.get(
          'error',
        ),
      ).toBe('invalid_client')
      expect(network).not.toHaveBeenCalled()
    } finally {
      network.mockRestore()
    }
    const registration = await state.auth.handler(
      new Request(`${ORIGIN}/api/auth/oauth2/register`, {
        body: JSON.stringify({
          client_name: 'Overprivileged client',
          redirect_uris: ['https://client.example.com/callback'],
          scope: 'mcp:publish',
          token_endpoint_auth_method: 'none',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
    )
    expect(registration.status).toBe(400)
  })
  it('requires PKCE before authorizing a dynamically registered client', async () => {
    const state = await setup()
    const query = new URLSearchParams({
      client_id: state.client.client_id,
      redirect_uri: 'https://client.example.com/callback',
      resource: `${ORIGIN}/mcp`,
      response_type: 'code',
      scope: 'mcp:read',
    })
    const response = await state.auth.handler(
      new Request(`${ORIGIN}/api/auth/oauth2/authorize?${query}`, {
        headers: new Headers({
          ...Object.fromEntries(state.headers),
          accept: 'application/json',
        }),
      }),
    )
    expect(response.status).toBe(200)
    const result = (await response.json()) as { url: string }
    const callback = new URL(result.url)
    expect(callback.searchParams.get('error')).toBe('invalid_request')
    expect(callback.searchParams.get('error_description')).toContain(
      'pkce is required',
    )
    expect(callback.searchParams.has('code')).toBe(false)
  })
  it.each([
    'https://feature-one-taste.example.workers.dev',
    'https://another-branch-taste.example.workers.dev',
  ])(
    'keeps discovery, PKCE tokens and MCP on preview origin %s',
    async origin => {
      const state = await setup(origin, true)
      const challenge = await state.handle(
        new Request(`${origin}/mcp`, { method: 'POST' }),
      )
      expect(challenge.headers.get('www-authenticate')).toContain(
        `${origin}/.well-known/oauth-protected-resource/mcp`,
      )
      const metadata = await state.auth.handler(
        new Request(`${origin}/.well-known/oauth-protected-resource/mcp`),
      )
      expect(await metadata.json()).toMatchObject({
        authorization_servers: [`${origin}/api/auth`],
        resource: `${origin}/mcp`,
      })
      const discovery = await state.auth.handler(
        new Request(
          `${origin}/.well-known/oauth-authorization-server/api/auth`,
        ),
      )
      expect(await discovery.json()).toMatchObject({
        authorization_endpoint: `${origin}/api/auth/oauth2/authorize`,
        issuer: `${origin}/api/auth`,
        token_endpoint: `${origin}/api/auth/oauth2/token`,
      })
      const tokens = await tokenFor(state)
      const claims = JSON.parse(
        Buffer.from(
          tokens.access_token.split('.')[1] ?? '',
          'base64url',
        ).toString(),
      )
      expect(claims).toMatchObject({
        aud: `${origin}/mcp`,
        iss: `${origin}/api/auth`,
      })
      const response = await state.handle(
        rpc(tokens.access_token, 'tools/list', {}, origin),
      )
      expect(response.status, await response.clone().text()).toBe(200)
      expect(
        (
          await protectedMcp(
            state.auth,
            state.db,
            OWNER,
            'https://foreign-taste.example.workers.dev',
          )(rpc(tokens.access_token, 'tools/list', {}, origin))
        ).status,
      ).toBe(401)
    },
  )
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
  it('requires explicit write consent and keeps read-only tokens from calling write tools', async () => {
    const state = await setup()
    const tokens = await tokenFor(state)
    const response = await state.handle(
      rpc(tokens.access_token, 'tools/call', {
        arguments: { description: 'test', note: 'secret', type: 'note' },
        name: 'save_item',
      }),
    )
    const payload = (await response.json()) as {
      error?: unknown
      result?: { isError?: boolean }
    }
    expect(Boolean(payload.error) || payload.result?.isError).toBe(true)
    expect(
      state.sqlite.prepare('SELECT count(*) AS n FROM items').get(),
    ).toMatchObject({ n: 0 })
  })

  it('saves base64 and URL images into the inbox, merges duplicates and only edits metadata', async () => {
    const state = await setup(ORIGIN, false, true)
    const tokens = await tokenFor(state)
    const call = async (name: string, args: object) => {
      const response = await state.handle(
        rpc(tokens.access_token, 'tools/call', { arguments: args, name }),
      )
      expect(response.status).toBe(200)
      return (
        (await response.json()) as {
          result: { isError?: boolean; content: { text: string }[] }
        }
      ).result
    }
    const list = await state.handle(rpc(tokens.access_token, 'tools/list'))
    expect(
      (
        (await list.json()) as { result: { tools: { name: string }[] } }
      ).result.tools
        .map(tool => tool.name)
        .sort(),
    ).toEqual([
      'get_item',
      'list_tags',
      'save_item',
      'search_items',
      'update_item',
    ])
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1])
    const input = {
      creditAuthor: 'Artist',
      creditUrl: 'https://example.com/artist',
      description: 'Warm poster',
      imageBase64: Buffer.from(png).toString('base64'),
      imageContentType: 'image/png',
      note: 'Keep',
      tags: ['WARM'],
      title: 'Original',
      type: 'image',
    }
    const first = await call('save_item', input)
    expect(first.isError).not.toBe(true)
    const saved = JSON.parse(first.content[0]?.text ?? '')
    expect(saved).toMatchObject({
      duplicate: false,
      item: {
        credit: { label: 'Artist', url: 'https://example.com/artist' },
        description: 'Warm poster',
        image: { url: expect.stringContaining(`${ORIGIN}/media/`) },
        origin: 'agent',
        status: 'inbox',
      },
    })
    expect(state.bucket.put).toHaveBeenCalledWith(expect.any(String), png, {
      httpMetadata: { contentType: 'image/png' },
    })
    const network = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(png, { headers: { 'content-type': 'image/png' } }),
      )
    try {
      const duplicate = await call('save_item', {
        creditAuthor: 'Other',
        description: 'Different',
        imageUrl: 'https://8.8.8.8/poster.png',
        tags: ['NEW'],
        type: 'image',
      })
      expect(JSON.parse(duplicate.content[0]?.text ?? '')).toMatchObject({
        duplicate: true,
        item: {
          credit: { label: 'Artist' },
          description: 'Warm poster',
          id: saved.item.id,
          tags: ['new', 'warm'],
        },
      })
      network.mockResolvedValueOnce(
        new Response(new Uint8Array([...png, 2]), {
          headers: { 'content-type': 'image/png' },
        }),
      )
      const remote = await call('save_item', {
        description: 'Remote',
        imageUrl: 'https://8.8.8.8/other.png',
        type: 'image',
      })
      expect(remote.isError).not.toBe(true)
      expect(JSON.parse(remote.content[0]?.text ?? '')).toMatchObject({
        duplicate: false,
        item: {
          origin: 'agent',
          sourceUrl: 'https://8.8.8.8/other.png',
          status: 'inbox',
        },
      })
    } finally {
      network.mockRestore()
    }
    const edited = await call('update_item', {
      creditAuthor: 'New artist',
      creditUrl: 'https://example.com/new',
      description: 'Updated',
      id: saved.item.id,
      tags: ['Edited'],
      title: 'New title',
    })
    expect(JSON.parse(edited.content[0]?.text ?? '')).toMatchObject({
      credit: { label: 'New artist' },
      description: 'Updated',
      note: 'Keep',
      origin: 'agent',
      status: 'inbox',
      tags: ['edited'],
      title: 'New title',
    })
    for (const args of [
      { ...input, description: undefined },
      { ...input, description: '   ' },
      { ...input, status: 'published' },
      { ...input, origin: 'manual' },
      { ...input, imageBase64: '!!!!' },
      { ...input, imageBase64: Buffer.from('not an image').toString('base64') },
      { description: 'Private', imageUrl: 'http://127.0.0.1/x', type: 'image' },
    ]) {
      // biome-ignore lint/performance/noAwaitInLoops: independently verify each invalid tool call
      expect((await call('save_item', args)).isError).toBe(true)
    }
    expect(
      (await call('save_item', { note: 'test', type: 'note' })).content[0]
        ?.text,
    ).toContain('description')
    expect(
      (await call('update_item', { id: saved.item.id, status: 'published' }))
        .isError,
    ).toBe(true)
    expect(
      (await call('update_item', { id: 'missing', note: 'x' })).isError,
    ).toBe(true)
    expect(
      state.sqlite
        .prepare('SELECT status, origin, published_at FROM items')
        .get(),
    ).toMatchObject({ origin: 'agent', published_at: null, status: 'inbox' })
  })
})
