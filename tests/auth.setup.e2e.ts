import { test } from '@e2e-dev/web'
import { credentials, expect } from 'e2e'

// Signs in once through the test login and saves the `owner` session for
// every test that declares `{ session: 'owner' }`.
test.setup(
  'sign in as the owner through the test login',
  { sessions: ['owner'] },
  async ({ app, browser, screen, session }) => {
    const owner = credentials.user('owner')
    await app.open('/test-login')
    await screen.getByLabel('Test login password').fill(owner.password)
    await screen.getByRole('button', 'Sign in as test owner').tap()

    await expect(browser).toHaveURL('/inbox')
    await expect(screen.getByRole('navigation', 'Inbox views')).toBeVisible()

    await session.save('owner')
  },
)
