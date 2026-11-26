import { createHash, randomBytes } from 'node:crypto'
import type { Browser, WebApp } from '@e2e-dev/web'
import { expect } from 'e2e'

// The slice of `screen` the consent step uses; e2e does not export its type.
interface Screen {
  getByRole: (role: 'button', name: string) => { tap: () => Promise<unknown> }
}

// The client's redirect target. It serves nothing: the route below answers it
// so the browser never leaves the app's origin, and hands over the code.
const CALLBACK_PATH = '/e2e/oauth-callback'

/**
 * Connects an MCP client the way a real one does, as the signed-in owner:
 * dynamic registration, authorization with PKCE, approval on the consent page,
 * and the code exchange. Needs a test restored with the `owner` session.
 */
export async function mcpAccessToken(
  { app, browser, screen }: { app: WebApp; browser: Browser; screen: Screen },
  scope = 'mcp:read mcp:write',
) {
  const origin = app.baseUrl
  const redirectUri = `${origin}${CALLBACK_PATH}`
  const registration = await fetch(`${origin}/api/auth/oauth2/register`, {
    body: JSON.stringify({
      client_name: 'e2e MCP client',
      redirect_uris: [redirectUri],
      scope,
      token_endpoint_auth_method: 'none',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  expect(registration.status).toBe(201)
  const { client_id: clientId } = (await registration.json()) as {
    client_id: string
  }

  const verifier = randomBytes(32).toString('base64url')
  const state = randomBytes(16).toString('base64url')
  let callback: URL | undefined
  await browser.route(`**${CALLBACK_PATH}**`, async route => {
    callback = new URL(route.request.url)
    await route.fulfill({ body: 'Connected.', contentType: 'text/plain' })
  })
  const query = new URLSearchParams({
    client_id: clientId,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    redirect_uri: redirectUri,
    resource: `${origin}/mcp`,
    response_type: 'code',
    scope,
    state,
  })
  await app.open(`/api/auth/oauth2/authorize?${query}`)
  await screen
    .getByRole(
      'button',
      scope.includes('mcp:write')
        ? 'Allow read and write access'
        : 'Allow read access',
    )
    .tap()
  await expect.poll(() => callback?.searchParams.get('code')).toBeTruthy()
  expect(callback?.searchParams.get('state')).toBe(state)

  const token = await fetch(`${origin}/api/auth/oauth2/token`, {
    body: new URLSearchParams({
      client_id: clientId,
      code: callback?.searchParams.get('code') ?? '',
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      resource: `${origin}/mcp`,
    }),
    method: 'POST',
  })
  expect(token.status).toBe(200)
  const { access_token: accessToken } = (await token.json()) as {
    access_token: string
  }
  return accessToken
}

/** Calls one MCP tool over the stateless HTTP transport. */
export async function callTool(
  app: WebApp,
  accessToken: string,
  name: string,
  args: Record<string, unknown> = {},
) {
  const response = await fetch(`${app.baseUrl}/mcp`, {
    body: JSON.stringify({
      id: 1,
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { arguments: args, name },
    }),
    headers: {
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  })
  // The transport answers with JSON or a one-message event stream.
  const text = await response.text()
  const json = response.headers.get('content-type')?.includes('event-stream')
    ? text
        .split('\n')
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice('data:'.length))
        .join('')
    : text
  return {
    body: JSON.parse(json) as {
      result?: { content: { text: string }[]; isError?: boolean }
    },
    status: response.status,
  }
}
