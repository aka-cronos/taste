import { useSuspenseQuery } from '@tanstack/react-query'
import { bootstrapQuery } from '@/lib/queries'

/** The signed-in owner, or null. Use it to show owner-only controls. */
export function useOwner() {
  return useSuspenseQuery(bootstrapQuery()).data.owner
}
