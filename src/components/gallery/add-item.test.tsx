import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AddItem } from '@/components/gallery/add-item'
import { addManualItem } from '@/lib/items/add'

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
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
  vi.spyOn(URL, 'createObjectURL').mockImplementation(
    file => `blob:${(file as File).name}`,
  )
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  vi.mocked(addManualItem).mockResolvedValue(saved)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function pasteText(text: string) {
  fireEvent.paste(document.body, {
    clipboardData: { files: [], getData: () => text },
  })
}

async function selectTag(tag: string, create = false) {
  const input = screen.getByRole('combobox', { name: 'Tags' })
  act(() => input.focus())
  fireEvent.change(input, { target: { value: tag } })
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  fireEvent.click(
    await screen.findByRole('option', {
      name: create ? `Create “${tag}”` : tag,
    }),
  )
}

it('pastes a note and publishes it with description and tags', async () => {
  render(<AddItem onSaved={onSaved} tags={['warm', 'type']} />)
  pasteText('Warm colors and strong typography')
  fireEvent.change(screen.getByLabelText('Description'), {
    target: { value: 'A palette' },
  })
  await selectTag('warm')
  await selectTag('type')
  fireEvent.click(screen.getByRole('button', { name: 'Publish item' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
  const data = vi.mocked(addManualItem).mock.calls[0]?.[0]?.data
  expect(data?.get('type')).toBe('note')
  expect(data?.get('note')).toBe('Warm colors and strong typography')
  expect(data?.get('description')).toBe('A palette')
  expect(data?.get('tags')).toBe('warm, type')
  expect(toast.success).toHaveBeenCalledWith('Published to your gallery.')
  expect(screen.queryByLabelText('Note')).toBeNull()
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
      fireEvent.click(screen.getByRole('button', { name: 'Image' }))
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
    expect(
      screen
        .getByRole('img', { name: 'Selected upload preview' })
        .getAttribute('src'),
    ).toBe('blob:reference.png')
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
    expect(screen.getByRole('alert').textContent).toContain('Page unavailable'),
  )
  expect((screen.getByLabelText('URL') as HTMLInputElement).value).toBe(
    'https://example.com/',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Publish item' }))
  await waitFor(() =>
    expect(toast.success).toHaveBeenCalledWith(
      'Already saved. New tags merged.',
    ),
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
  await waitFor(() => expect(addManualItem).toHaveBeenCalledOnce())
  await act(() => {
    finish?.(saved)
  })
})

it('validates after blur and clears errors when corrected', async () => {
  render(<AddItem onSaved={onSaved} />)
  fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
  const url = screen.getByLabelText('URL')
  fireEvent.change(url, { target: { value: 'invalid' } })
  expect(screen.queryByRole('alert')).toBeNull()
  fireEvent.blur(url)
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toBe('Invalid URL.'),
  )
  expect(url.getAttribute('aria-invalid')).toBe('true')
  expect(
    document.querySelector(`[id="${url.getAttribute('aria-describedby')}"]`)
      ?.textContent,
  ).toBe('Invalid URL.')
  fireEvent.change(url, { target: { value: 'https://example.com/' } })
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  fireEvent.change(url, { target: { value: 'invalid again' } })
  await screen.findByText('Invalid URL.')
})

it('places server schema failures on the corresponding field', async () => {
  vi.mocked(addManualItem).mockResolvedValueOnce({
    fieldErrors: { sourceUrl: 'Server URL error' },
  })
  render(<AddItem onSaved={onSaved} />)
  pasteText('https://example.com/')
  fireEvent.click(screen.getByRole('button', { name: 'Publish item' }))
  await screen.findByText('Server URL error')
  const url = screen.getByLabelText('URL')
  expect(url.getAttribute('aria-invalid')).toBe('true')
  expect((url as HTMLInputElement).value).toBe('https://example.com/')
  fireEvent.change(url, { target: { value: 'https://example.com/fixed' } })
  await waitFor(() => expect(screen.queryByText('Server URL error')).toBeNull())
})

it('shows a field error when submitting without an image', async () => {
  render(<AddItem onSaved={onSaved} />)
  fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
  fireEvent.click(screen.getByRole('button', { name: 'Image' }))
  fireEvent.click(screen.getByRole('button', { name: 'Publish item' }))
  await screen.findByText('Choose an image first.')
  expect(screen.getByLabelText('Image').getAttribute('aria-invalid')).toBe(
    'true',
  )
  expect(addManualItem).not.toHaveBeenCalled()
})

it.each(['size', 'type'])(
  'immediately rejects an image with invalid %s',
  async reason => {
    render(<AddItem onSaved={onSaved} />)
    const file =
      reason === 'size'
        ? new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.png', {
            type: 'image/png',
          })
        : new File(['text'], 'file.txt', { type: 'text/plain' })
    fireEvent.paste(document.body, { clipboardData: { files: [file] } })
    await screen.findByText(
      'Choose a PNG, JPEG, GIF or WebP image up to 10 MB.',
    )
    const image = screen.getByLabelText('Image')
    expect(image.getAttribute('aria-invalid')).toBe('true')
    for (const id of image.getAttribute('aria-describedby')?.split(' ') ?? []) {
      expect(document.querySelector(`[id="${id}"]`)).toBeTruthy()
    }
  },
)

it('gives controls unique ids when two forms are mounted', () => {
  render(
    <>
      <AddItem onSaved={onSaved} />
      <AddItem onSaved={onSaved} />
    </>,
  )
  for (const button of screen.getAllByRole('button', { name: 'Add item' })) {
    fireEvent.click(button)
  }
  const urls = screen.getAllByLabelText('URL')
  expect(urls[0]?.id).not.toBe(urls[1]?.id)
})

it('does not intercept image pastes in text fields', () => {
  render(<AddItem onSaved={onSaved} />)
  pasteText('A note')
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', {
    value: { files: [new File(['png'], 'image.png', { type: 'image/png' })] },
  })
  fireEvent(screen.getByLabelText('Note'), event)
  expect(event.defaultPrevented).toBe(false)
  expect(screen.getByLabelText('Note')).toBeTruthy()
})

it('can correct a missing image after submit and publish', async () => {
  render(<AddItem onSaved={onSaved} />)
  fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
  fireEvent.click(screen.getByRole('button', { name: 'Image' }))
  fireEvent.click(screen.getByRole('button', { name: 'Publish item' }))
  await screen.findByText('Choose an image first.')
  fireEvent.change(screen.getByLabelText('Image'), {
    target: { files: [new File(['png'], 'image.png', { type: 'image/png' })] },
  })
  await waitFor(() =>
    expect(screen.queryByText('Choose an image first.')).toBeNull(),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Publish item' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
})

it('keeps errors hidden on an unblurred field when another field validates', () => {
  render(<AddItem onSaved={onSaved} />)
  fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
  fireEvent.blur(screen.getByLabelText('Description'))
  fireEvent.change(screen.getByLabelText('URL'), {
    target: { value: 'invalid' },
  })
  expect(screen.queryByRole('alert')).toBeNull()
})

it('keeps the selected image when a drop contains no files', async () => {
  render(<AddItem onSaved={onSaved} />)
  const file = new File(['image'], 'reference.png', { type: 'image/png' })
  fireEvent.paste(document.body, { clipboardData: { files: [file] } })
  fireEvent.drop(
    screen.getByRole('button', { name: 'Drop an image here or choose a file' }),
    {
      dataTransfer: {
        files: [],
        getData: () => 'https://example.com/image.png',
      },
    },
  )
  expect(screen.getByText('reference.png')).toBeTruthy()
  expect(screen.queryByText('Choose an image first.')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Publish item' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
  expect(vi.mocked(addManualItem).mock.calls[0]?.[0]?.data?.get('image')).toBe(
    file,
  )
})

it('selects, creates and removes tag chips before publishing', async () => {
  render(<AddItem onSaved={onSaved} tags={['warm', 'poster']} />)
  pasteText('A note')
  await selectTag('warm')
  await selectTag('poster')
  await selectTag('new tag', true)
  fireEvent.click(
    within(screen.getByLabelText('Remove warm')).getByRole('button'),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Publish item' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
  expect(vi.mocked(addManualItem).mock.calls[0]?.[0]?.data?.get('tags')).toBe(
    'poster, new tag',
  )
  pasteText('Another note')
  expect(screen.queryByText('poster')).toBeNull()
})

it('keeps one type selected and follows automatic paste detection', () => {
  render(<AddItem onSaved={onSaved} />)
  fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
  const link = screen.getByRole('button', { name: 'Link' })
  expect(link.getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(link)
  expect(link.getAttribute('aria-pressed')).toBe('true')
  pasteText('A note')
  expect(
    screen.getByRole('button', { name: 'Note' }).getAttribute('aria-pressed'),
  ).toBe('true')
  pasteText('https://example.com/')
  expect(link.getAttribute('aria-pressed')).toBe('true')
})

it('releases preview URLs when replacing images, changing type and unmounting', () => {
  const { unmount } = render(<AddItem onSaved={onSaved} />)
  const pasteImage = (name: string) =>
    fireEvent.paste(document.body, {
      clipboardData: {
        files: [new File(['image'], name, { type: 'image/png' })],
      },
    })
  pasteImage('first.png')
  pasteImage('second.png')
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first.png')
  expect(screen.getByRole('img').getAttribute('src')).toBe('blob:second.png')
  fireEvent.click(screen.getByRole('button', { name: 'Note' }))
  expect(screen.queryByRole('img')).toBeNull()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:second.png')
  pasteImage('third.png')
  unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:third.png')
})

it.each(['warm', 'random'])(
  'selects %s with Enter without publishing',
  async tag => {
    render(<AddItem onSaved={onSaved} tags={['warm']} />)
    pasteText('A note')
    const input = screen.getByRole('combobox', { name: 'Tags' })
    act(() => input.focus())
    fireEvent.input(input, {
      data: tag,
      inputType: 'insertText',
      target: { value: tag },
    })
    const option = await screen.findByRole('option', {
      name: tag === 'warm' ? tag : `Create “${tag}”`,
    })
    await waitFor(() =>
      expect(option.hasAttribute('data-highlighted')).toBe(true),
    )
    expect(fireEvent.keyDown(input, { key: 'Enter' })).toBe(false)
    expect(screen.getByLabelText(`Remove ${tag}`)).toBeTruthy()
    expect(addManualItem).not.toHaveBeenCalled()
    expect(fireEvent.keyDown(input, { key: 'Enter' })).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Publish item' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
    expect(vi.mocked(addManualItem).mock.calls[0]?.[0]?.data?.get('tags')).toBe(
      tag,
    )
  },
)
