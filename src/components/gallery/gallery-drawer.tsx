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
 * A modal drawer over the gallery. On desktop it comes in from the right;
 * on mobile it is a bottom sheet that keeps focused fields above the keyboard.
 *
 * `onClose` runs when the owner asks to close it (close button, Escape,
 * swipe or a tap outside); the parent decides whether it closes.
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
        <DrawerContent className='data-[swipe-axis=x]:shadow-xl data-[swipe-axis=x]:[--drawer-inset:1rem] data-[swipe-axis=x]:after:hidden data-[swipe-direction=right]:rounded-2xl data-[swipe-direction=right]:border data-[swipe-axis=x]:sm:[--drawer-content-width:min(40rem,calc(100vw-4rem))]'>
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
