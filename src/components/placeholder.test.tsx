import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Placeholder } from './placeholder'

afterEach(() => {
  cleanup()
  document.documentElement.classList.remove('dark')
  localStorage.clear()
})

describe('Placeholder', () => {
  it('renders the site name', () => {
    render(<Placeholder />)
    expect(screen.getByRole('heading', { name: 'Taste' })).toBeTruthy()
  })

  it('toggles and remembers the theme', () => {
    render(<Placeholder />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle theme' }))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('taste-theme')).toBe('dark')
  })
})
