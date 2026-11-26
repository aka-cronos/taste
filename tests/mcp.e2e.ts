import { randomUUID } from 'node:crypto'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { callTool, mcpAccessToken } from './support/mcp'

test('an MCP client connected by the owner reads and saves to the inbox', {
  session: 'owner',
}, async ({ app, browser, screen }) => {
  const token = await mcpAccessToken({ app, browser, screen })

  const tags = await callTool(app, token, 'list_tags')
  expect(tags.status).toBe(200)
  expect(tags.body.result?.isError).toBeFalsy()

  const title = `e2e note ${randomUUID().slice(0, 8)}`
  const saved = await callTool(app, token, 'save_item', {
    creditAuthor: 'e2e',
    description: 'A plain test note saved by the e2e MCP flow.',
    note: 'Saved through the real OAuth flow.',
    tags: ['e2e'],
    title,
    type: 'note',
  })
  expect(saved.status).toBe(200)
  expect(saved.body.result?.isError).toBeFalsy()

  await app.open('/inbox')
  await expect(screen.getByText(title)).toBeVisible()
})

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
