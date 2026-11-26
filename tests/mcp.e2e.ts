import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

test('the MCP endpoint rejects requests without a token', async ({ app }) => {
  const response = await fetch(`${app.baseUrl}/mcp`, {
    body: '{}',
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  expect(response.status).toBe(401)
  expect(response.headers.get('www-authenticate')).toContain(
    'oauth-protected-resource',
  )
})
