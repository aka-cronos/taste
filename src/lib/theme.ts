export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'taste-theme'

// Runs in <head> before first paint so the page never flashes the wrong theme.
// An explicit choice in storage wins; otherwise the page follows the system.
export const themeInitScript = `(() => {
  let stored = null
  try { stored = localStorage.getItem('${THEME_STORAGE_KEY}') } catch {}
  const dark = stored === 'dark' || (stored !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
})()`

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}
