import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

test('the owner session opens the inbox', { session: 'owner' }, async ({
  app,
  screen,
}) => {
  await app.open('/inbox')
  await expect(screen.getByRole('navigation', 'Inbox views')).toBeVisible()
  await expect(screen.getByText('Page not found')).toBeHidden()
})

test('the test login rejects a wrong password', async ({ app, screen }) => {
  await app.open('/test-login')
  await screen
    .getByLabel('Test login password')
    .fill('not-the-test-login-password')
  await screen.getByRole('button', 'Sign in as test owner').tap()
  await expect(screen.getByRole('alert')).toContainText('Sign-in failed')

  await app.open('/inbox')
  await expect(screen.getByText('Page not found')).toBeVisible()
})
