import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test/router'
import { SiteHeader } from './site-header'

afterEach(() => {
  cleanup()
  document.documentElement.classList.remove('dark')
  localStorage.clear()
})

const owner = { email: 'owner@example.com', image: null, name: 'Owner' }
const INBOX = /Inbox/u
const noop = () => Promise.resolve()

describe('SiteHeader', () => {
  it('offers sign-in to visitors, without an inbox', async () => {
    const onSignIn = vi.fn(noop)
    await renderWithRouter(
      <SiteHeader onSignIn={onSignIn} onSignOut={noop} owner={null} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(onSignIn).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull()
    expect(screen.queryByRole('link', { name: INBOX })).toBeNull()
  })

  it('shows the owner and offers sign-out', async () => {
    const onSignOut = vi.fn(noop)
    await renderWithRouter(
      <SiteHeader onSignIn={noop} onSignOut={onSignOut} owner={owner} />,
    )
    expect(screen.getByText('Owner')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(onSignOut).toHaveBeenCalledOnce()
  })

  it('links the owner to the inbox with a count badge', async () => {
    await renderWithRouter(
      <SiteHeader
        inboxCount={3}
        onSignIn={noop}
        onSignOut={noop}
        owner={owner}
      />,
    )
    const inbox = screen.getByRole('link', { name: 'Inbox, 3 items' })
    expect(inbox.getAttribute('href')).toBe('/inbox')
    expect(inbox.textContent).toBe('Inbox3')
  })

  it('hides the badge when the inbox is empty', async () => {
    await renderWithRouter(
      <SiteHeader onSignIn={noop} onSignOut={noop} owner={owner} />,
    )
    expect(
      screen.getByRole('link', { name: 'Inbox, 0 items' }).textContent,
    ).toBe('Inbox')
  })

  it('shows a rejected sign-in as an alert', async () => {
    await renderWithRouter(
      <SiteHeader
        authError='Not authorized'
        onSignIn={noop}
        onSignOut={noop}
        owner={null}
      />,
    )
    expect(screen.getByRole('alert').textContent).toBe('Not authorized')
  })

  it('toggles and remembers the theme', async () => {
    await renderWithRouter(
      <SiteHeader onSignIn={noop} onSignOut={noop} owner={null} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Toggle theme' }))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('taste-theme')).toBe('dark')
  })
})
