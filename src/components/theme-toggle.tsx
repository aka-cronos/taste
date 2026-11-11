import { MoonIcon, SunIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { applyTheme, THEME_STORAGE_KEY } from '@/lib/theme'

export function ThemeToggle() {
  const toggle = () => {
    const next = document.documentElement.classList.contains('dark')
      ? 'light'
      : 'dark'
    applyTheme(next)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Storage can be unavailable (private mode); the toggle still works for this visit.
    }
  }

  return (
    <Button
      aria-label='Toggle theme'
      onClick={toggle}
      size='icon'
      variant='ghost'
    >
      <SunIcon className='hidden dark:block' />
      <MoonIcon className='dark:hidden' />
    </Button>
  )
}
