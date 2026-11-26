import { randomUUID } from 'node:crypto'
import { test } from '@e2e-dev/web'
import { credentials, expect } from 'e2e'
import { callTool, mcpAccessToken } from './support/mcp'

test('with the gate on, a wrong password returns 401 and creates no session', async ({
  app,
  browser,
  screen,
}) => {
  await app.open('/test-login')
  const rejected = browser.waitForResponse('**/api/auth/test-login')
  await screen
    .getByLabel('Test login password')
    .fill('deliberately-wrong-password')
  await screen.getByRole('button', 'Sign in as test owner').tap()
  expect((await rejected).status).toBe(401)
  await expect(screen.getByRole('alert')).toContainText('Sign-in failed')
  expect(
    (await browser.cookies()).some(cookie =>
      cookie.name.includes('session_token'),
    ),
  ).toBe(false)
  await app.open('/inbox')
  await expect(screen.getByText('Page not found')).toBeVisible()
})

test('a correct password yields an owner session and inbox access', async ({
  app,
  browser,
  screen,
}) => {
  await app.open('/test-login')
  await screen
    .getByLabel('Test login password')
    .fill(credentials.user('owner').password)
  await screen.getByRole('button', 'Sign in as test owner').tap()
  await expect(browser).toHaveURL('/inbox')
  await expect(screen.getByRole('navigation', 'Inbox views')).toBeVisible()
  await browser.reload()
  await expect(screen.getByRole('navigation', 'Inbox views')).toBeVisible()
})

test('a browser test restores owner and proves an owner-only inbox flow', {
  session: 'owner',
}, async ({ app, browser, screen }) => {
  const token = await mcpAccessToken({ app, browser, screen })
  const title = `Verification 93 ${randomUUID()}`
  const saved = await callTool(app, token, 'save_item', {
    description: 'Synthetic verification data for issue 93.',
    note: 'Created by the restored owner session through OAuth.',
    title,
    type: 'note',
  })
  expect(saved.status).toBe(200)
  expect(saved.body.result?.isError).toBeFalsy()
  await app.open('/inbox')
  await expect(screen.getByText(title)).toBeVisible()
  await browser.reload()
  await expect(screen.getByText(title)).toBeVisible()
})

test('the MCP token helper completes OAuth and a read tool returns 200', {
  session: 'owner',
}, async ({ app, browser, screen }) => {
  const token = await mcpAccessToken({ app, browser, screen }, 'mcp:read')
  const tags = await callTool(app, token, 'list_tags')
  expect(tags.status).toBe(200)
  expect(tags.body.result?.isError).toBeFalsy()
  expect(tags.body.result?.content.length).toBeGreaterThan(0)
})
