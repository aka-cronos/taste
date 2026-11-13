import { XIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerVirtualKeyboardProvider,
} from '@/components/ui/drawer'
import { useMediaQuery } from '@/hooks/use-media-query'

/**
 * A drawer over the gallery. On desktop it comes in from the right and stays
 * non-modal, so the gallery behind remains visible and interactive; on mobile
 * it is a modal bottom sheet that keeps focused fields above the keyboard.
 *
 * `onClose` runs when the owner asks to close it (close button, Escape,
 * swipe or a tap outside on mobile); the parent decides whether it closes.
 */
export function GalleryDrawer({
  children,
  description,
  onClose,
  open,
  title,
}: {
  children: ReactNode
  description?: ReactNode
  onClose: () => void
  open: boolean
  title: ReactNode
}) {
  const desktop = useMediaQuery('(min-width: 48rem)', true)
  return (
    <Drawer
      // Clicking a card behind the drawer swaps its item instead of closing.
      disablePointerDismissal={desktop}
      modal={!desktop}
      onOpenChange={next => {
        if (!next) {
          onClose()
        }
      }}
      open={open}
      showSwipeHandle={!desktop}
      swipeDirection={desktop ? 'right' : 'down'}
    >
      <DrawerVirtualKeyboardProvider>
        <DrawerContent className='data-[swipe-axis=x]:shadow-xl data-[swipe-axis=x]:sm:[--drawer-content-width:min(40rem,calc(100vw-4rem))]'>
          <DrawerHeader className='flex-row items-center gap-2 border-b pb-3 md:gap-2'>
            <div className='flex min-w-0 flex-1 flex-col gap-0.5 text-left'>
              <DrawerTitle className='truncate'>{title}</DrawerTitle>
              {description ? (
                <DrawerDescription>{description}</DrawerDescription>
              ) : null}
            </div>
            <DrawerClose
              render={
                <Button aria-label='Close' size='icon-sm' variant='ghost' />
              }
            >
              <XIcon aria-hidden />
            </DrawerClose>
          </DrawerHeader>
          <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain p-4'>
            {children}
          </div>
        </DrawerContent>
      </DrawerVirtualKeyboardProvider>
    </Drawer>
  )
}
