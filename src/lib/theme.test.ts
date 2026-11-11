import { afterEach, describe, expect, it, vi } from 'vitest'
import { THEME_STORAGE_KEY, themeInitScript } from './theme'

function runInitScript(systemPrefersDark: boolean) {
  vi.stubGlobal('matchMedia', () => ({ matches: systemPrefersDark }))
  new Function(themeInitScript)()
  return document.documentElement.classList.contains('dark')
}

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
  document.documentElement.classList.remove('dark')
})

describe('themeInitScript', () => {
  it('follows the system when nothing is stored', () => {
    expect(runInitScript(true)).toBe(true)
    expect(runInitScript(false)).toBe(false)
  })

  it('lets a stored choice override the system', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light')
    expect(runInitScript(true)).toBe(false)
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    expect(runInitScript(false)).toBe(true)
  })
})
