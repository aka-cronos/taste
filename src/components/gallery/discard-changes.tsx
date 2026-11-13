import { type ParsedLocation, useRouter } from '@tanstack/react-router'
import { useEffect, useEffectEvent, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

/**
 * The page and gallery drawer a location shows. Filters can change behind an
 * open drawer without leaving it.
 */
function panelOf({ pathname, search }: ParsedLocation) {
  const { add, item } = search as { add?: unknown; item?: unknown }
  return JSON.stringify([pathname, item ?? null, add ?? null])
}

/**
 * While `enabled`, holds navigations that would close or switch the open
 * drawer (or leave the page) when `isDirty()` returns true, until the owner
 * discards or keeps their changes. Reloading or closing the tab asks the
 * browser to confirm instead. Pending mutations block navigation outright,
 * including filter changes that could remount the form.
 *
 * Read dirty state from the form at call time, e.g.
 * `() => form.state.isDirty`.
 */
export function useDiscardGuard({
  enabled,
  isDirty,
  isBusy = () => false,
}: {
  enabled: boolean
  isDirty: () => boolean
  isBusy?: () => boolean
}) {
  const router = useRouter()
  const [pending, setPending] = useState<{
    resolve: (leave: boolean) => void
  } | null>(null)
  const dirty = useEffectEvent(isDirty)
  const busy = useEffectEvent(isBusy)
  useEffect(() => {
    if (!enabled) {
      return
    }
    return router.history.block({
      blockerFn: async ({ currentLocation, nextLocation }) => {
        if (busy()) {
          return true
        }
        if (
          !dirty() ||
          panelOf(router.parseLocation(currentLocation)) ===
            panelOf(router.parseLocation(nextLocation))
        ) {
          return false
        }
        const leave = await new Promise<boolean>(resolve => {
          setPending({ resolve })
        })
        setPending(null)
        return !leave
      },
      enableBeforeUnload: () => busy() || dirty(),
    })
  }, [enabled, router])
  return {
    /** A navigation is waiting for the owner to decide. */
    blocked: Boolean(pending),
    /** Lets the waiting navigation through (`true`) or cancels it. */
    resolve: (leave: boolean) => pending?.resolve(leave && !isBusy()),
  }
}

/** Asks before throwing away unsaved form changes. */
export function DiscardChangesDialog({
  onDiscard,
  onKeepEditing,
  open,
}: {
  onDiscard: () => void
  onKeepEditing: () => void
  open: boolean
}) {
  return (
    <AlertDialog
      onOpenChange={next => {
        if (!next) {
          onKeepEditing()
        }
      }}
      open={open}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard changes?</AlertDialogTitle>
          <AlertDialogDescription>
            Your unsaved changes will be lost.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction onClick={onDiscard} variant='destructive'>
            Discard
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
