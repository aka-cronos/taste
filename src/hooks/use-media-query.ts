import { useCallback, useSyncExternalStore } from 'react'

function canMatch() {
  return (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  )
}

/**
 * Whether `query` matches the viewport. Returns `fallback` on the server and
 * where `matchMedia` is unavailable.
 */
export function useMediaQuery(query: string, fallback = false) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!canMatch()) {
        return () => undefined
      }
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => (canMatch() ? window.matchMedia(query).matches : fallback),
    () => fallback,
  )
}
