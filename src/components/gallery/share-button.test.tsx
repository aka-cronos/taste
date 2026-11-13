import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ShareButton, shareLink } from '@/components/gallery/share-button'
import type { GalleryItem } from '@/lib/items/model'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const LINK = { title: 'Alpha', url: 'https://taste.example/items/a' }
const share = vi.fn<(data: ShareData) => Promise<void>>()
const writeText = vi.fn<(text: string) => Promise<void>>()

function stubNavigator({ canShare }: { canShare: boolean }) {
  vi.stubGlobal('navigator', {
    clipboard: { writeText },
    share: canShare ? share : undefined,
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  share.mockResolvedValue(undefined)
  writeText.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('shareLink', () => {
  it('opens the native share sheet with the title and URL', async () => {
    stubNavigator({ canShare: true })
    await shareLink(LINK)
    expect(share).toHaveBeenCalledWith(LINK)
    expect(writeText).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('does nothing when the share sheet is cancelled', async () => {
    stubNavigator({ canShare: true })
    share.mockRejectedValue(new DOMException('Cancelled', 'AbortError'))
    await shareLink(LINK)
    expect(writeText).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('copies the link when the share sheet fails', async () => {
    stubNavigator({ canShare: true })
    share.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'))
    await shareLink(LINK)
    expect(writeText).toHaveBeenCalledWith(LINK.url)
    expect(toast.success).toHaveBeenCalledWith('Link copied.')
  })

  it('copies the link and confirms without the Web Share API', async () => {
    stubNavigator({ canShare: false })
    await shareLink(LINK)
    expect(writeText).toHaveBeenCalledWith(LINK.url)
    expect(toast.success).toHaveBeenCalledWith('Link copied.')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('says so when copying fails', async () => {
    stubNavigator({ canShare: false })
    writeText.mockRejectedValue(new Error('Clipboard blocked'))
    await shareLink(LINK)
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Could not copy the link.')
  })
})

describe('ShareButton', () => {
  it('shares the item page URL under an accessible label', () => {
    stubNavigator({ canShare: true })
    const item: GalleryItem = {
      credit: null,
      description: '',
      id: 'a',
      image: null,
      note: 'Text',
      publishedAt: 1,
      sourceUrl: null,
      tags: [],
      title: 'Alpha',
      type: 'note',
    }
    render(<ShareButton item={item} />)
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    expect(share).toHaveBeenCalledWith({
      title: 'Alpha',
      url: `${window.location.origin}/items/a`,
    })
  })
})
