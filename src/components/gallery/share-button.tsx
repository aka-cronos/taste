import { Share2Icon } from 'lucide-react'
import type { ComponentProps } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { type GalleryItem, itemLabel } from '@/lib/items/model'
import { itemUrl } from '@/lib/items/share'

function isAbort(error: unknown) {
  return (error as { name?: unknown } | null)?.name === 'AbortError'
}

/**
 * Shares a link through the system share sheet when the browser has one,
 * otherwise copies it and confirms with a toast. Closing the share sheet is
 * not an error; a share sheet that fails falls back to copying.
 */
export async function shareLink({
  title,
  url,
}: {
  title: string
  url: string
}) {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, url })
      return
    } catch (error) {
      if (isAbort(error)) {
        return
      }
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    toast.success('Link copied.')
  } catch {
    toast.error('Could not copy the link.')
  }
}

/** Shares a published item's page. Never render it for inbox items. */
export function ShareButton({
  item,
  ...props
}: { item: GalleryItem } & Omit<
  ComponentProps<typeof Button>,
  'aria-label' | 'children' | 'onClick'
>) {
  return (
    <Button
      aria-label='Share'
      onClick={() =>
        shareLink({
          title: itemLabel(item),
          url: itemUrl(item.id, window.location.origin),
        })
      }
      title='Share'
      type='button'
      {...props}
    >
      <Share2Icon aria-hidden />
    </Button>
  )
}
