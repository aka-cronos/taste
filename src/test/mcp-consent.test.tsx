import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Route } from '@/routes/mcp_.authorize'

const state = vi.hoisted(() => ({ searchStr: '' }))
vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useLocation: () => state.searchStr,
}))
vi.mock('@/lib/auth/use-owner', () => ({ useOwner: () => ({ name: 'Owner' }) }))
vi.mock('@/lib/auth/client', () => ({
  authClient: { oauth2: { consent: vi.fn() } },
}))
afterEach(cleanup)

it.each([
  [
    'mcp:read',
    'Allow read access',
    'It cannot edit, publish or delete anything.',
  ],
  [
    'mcp:read mcp:write',
    'Allow read and write access',
    'save to your inbox, and edit metadata.',
  ],
])('describes consent for %s', (scope, button, description) => {
  state.searchStr = `?client_id=Test+MCP&sig=test&scope=${encodeURIComponent(scope)}`
  const Component = Route.options.component as () => React.ReactNode
  render(<Component />)
  expect(screen.getByRole('button', { name: button })).toBeTruthy()
  expect(screen.getByText(description, { exact: false })).toBeTruthy()
})
