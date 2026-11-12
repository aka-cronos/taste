import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AddItem } from '@/components/gallery/add-item'
import { addManualItem } from '@/lib/items/add'

vi.mock('@/lib/items/add', () => ({ addManualItem: vi.fn() }))
const onSaved = vi.fn().mockResolvedValue(undefined)
const saved = {
  duplicate: false,
  item: {
    description: '',
    id: 'saved',
    note: null,
    source_url: null,
    status: 'published' as const,
    tags: [],
    title: null,
    type: 'image' as const,
  },
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(addManualItem).mockResolvedValue(saved)
})
afterEach(cleanup)

function pasteText(text: string) {
  fireEvent.paste(document.body, {
    clipboardData: { files: [], getData: () => text },
  })
}

it('pastes a note and publishes it with description and tags', async () => {
  render(<AddItem onSaved={onSaved} />)
  pasteText('Warm colors and strong typography')
  fireEvent.change(screen.getByLabelText('Description'), {
    target: { value: 'A palette' },
  })
  fireEvent.change(screen.getByLabelText('Tags (comma separated)'), {
    target: { value: 'Warm, Type' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Publish item' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
  const data = vi.mocked(addManualItem).mock.calls[0]?.[0]?.data
  expect(data?.get('type')).toBe('note')
  expect(data?.get('note')).toBe('Warm colors and strong typography')
  expect(data?.get('description')).toBe('A palette')
  expect(data?.get('tags')).toBe('Warm, Type')
  expect(screen.getByRole('status').textContent).toContain('Published')
})

it('detects a pasted URL as a link without intercepting typing in form fields', async () => {
  render(<AddItem onSaved={onSaved} />)
  pasteText('https://example.com/article')
  expect(screen.getByLabelText('URL').getAttribute('value')).toBe(
    'https://example.com/article',
  )
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', {
    value: { files: [], getData: () => 'new text' },
  })
  fireEvent(screen.getByLabelText('Description'), event)
  expect(event.defaultPrevented).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Publish item' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
  expect(
    vi.mocked(addManualItem).mock.calls[0]?.[0]?.data?.get('sourceUrl'),
  ).toBe('https://example.com/article')
})

it.each(['paste', 'picker', 'drop'])(
  'accepts an image through %s',
  async method => {
    render(<AddItem onSaved={onSaved} />)
    const file = new File(['image'], 'reference.png', { type: 'image/png' })
    if (method === 'paste') {
      fireEvent.paste(document.body, { clipboardData: { files: [file] } })
    } else {
      fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
      fireEvent.change(screen.getByLabelText('Item type'), {
        target: { value: 'image' },
      })
      if (method === 'picker') {
        fireEvent.change(screen.getByLabelText('Image'), {
          target: { files: [file] },
        })
      } else {
        fireEvent.drop(
          screen.getByRole('button', {
            name: 'Drop an image here or choose a file',
          }),
          { dataTransfer: { files: [file] } },
        )
      }
    }
    expect(screen.getByText('reference.png')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Publish item' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
    expect(
      vi.mocked(addManualItem).mock.calls[0]?.[0]?.data?.get('image'),
    ).toBe(file)
  },
)

it('retains the form after an error and reports merged duplicates on retry', async () => {
  vi.mocked(addManualItem)
    .mockRejectedValueOnce(new Error('Page unavailable'))
    .mockResolvedValueOnce({ ...saved, duplicate: true })
  render(<AddItem onSaved={onSaved} />)
  pasteText('https://example.com/')
  fireEvent.click(screen.getByRole('button', { name: 'Publish item' }))
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain(
      'Page unavailable',
    ),
  )
  expect((screen.getByLabelText('URL') as HTMLInputElement).value).toBe(
    'https://example.com/',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Publish item' }))
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('New tags merged'),
  )
})

it('prevents a second submission while a save is pending', async () => {
  let finish: ((value: typeof saved) => void) | undefined
  vi.mocked(addManualItem).mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve
      }),
  )
  render(<AddItem onSaved={onSaved} />)
  pasteText('A note')
  const submit = screen.getByRole('button', { name: 'Publish item' })
  fireEvent.click(submit)
  fireEvent.click(submit)
  expect(addManualItem).toHaveBeenCalledOnce()
  await act(() => {
    finish?.(saved)
  })
})
