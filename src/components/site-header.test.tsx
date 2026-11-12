import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SiteHeader } from './site-header'

afterEach(() => {
  cleanup()
  document.documentElement.classList.remove('dark')
  localStorage.clear()
})

const owner = { email: 'owner@example.com', image: null, name: 'Owner' }
const noop = () => Promise.resolve()

describe('SiteHeader', () => {
  it('offers sign-in to visitors', () => {
    const onSignIn = vi.fn(noop)
    render(<SiteHeader onSignIn={onSignIn} onSignOut={noop} owner={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(onSignIn).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull()
  })

  it('shows the owner and offers sign-out', () => {
    const onSignOut = vi.fn(noop)
    render(<SiteHeader onSignIn={noop} onSignOut={onSignOut} owner={owner} />)
    expect(screen.getByText('Owner')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(onSignOut).toHaveBeenCalledOnce()
  })

  it('shows a rejected sign-in as an alert', () => {
    render(
      <SiteHeader
        authError='Not authorized'
        onSignIn={noop}
        onSignOut={noop}
        owner={null}
      />,
    )
    expect(screen.getByRole('alert').textContent).toBe('Not authorized')
  })

  it('toggles and remembers the theme', () => {
    render(<SiteHeader onSignIn={noop} onSignOut={noop} owner={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle theme' }))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('taste-theme')).toBe('dark')
  })
})
