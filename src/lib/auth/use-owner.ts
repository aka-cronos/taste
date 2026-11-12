import { useRouteContext } from '@tanstack/react-router'

/** The signed-in owner, or null. Use it to show owner-only controls. */
export function useOwner() {
  return useRouteContext({ from: '__root__', select: context => context.owner })
}
