import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Owner } from '@/lib/auth/owner'
import type { ItemEditorData } from '@/lib/items/edit-input'
import {
  changeItemVisibility,
  getOwnerItem,
  permanentlyDeleteItem,
  saveItemEdits,
} from '@/lib/items/manage-server'
import type { GalleryItem } from '@/lib/items/model'
import { getGalleryItem } from '@/lib/items/server'
import { Route } from '@/routes/items/$id'

vi.mock('@/lib/items/manage-server', () => ({
  changeItemVisibility: vi.fn(),
  getOwnerItem: vi.fn(),
  permanentlyDeleteItem: vi.fn(),
  saveItemEdits: vi.fn(),
}))
vi.mock('@/lib/items/server', () => ({ getGalleryItem: vi.fn() }))
vi.mock('@/lib/request-origin', () => ({
  getRequestOrigin: () => 'https://taste.example',
}))
const owner: Owner = { email: 'owner@example.com', image: null, name: 'Owner' }
let editor: ItemEditorData
let item: GalleryItem
beforeEach(() => {
  vi.resetAllMocks()
  editor = {
    creditAuthor: '',
    creditUrl: '',
    description: 'A reference',
    id: 'item',
    note: 'A note',
    status: 'published',
    tags: ['warm'],
    title: 'Original',
  }
  item = {
    credit: null,
    description: editor.description,
    id: 'item',
    image: null,
    note: editor.note,
    publishedAt: 1,
    sourceUrl: null,
    tags: editor.tags,
    title: editor.title,
    type: 'note',
  }
  vi.mocked(getOwnerItem).mockImplementation(() =>
    Promise.resolve({
      editor: { ...editor },
      item: { ...item },
      tags: ['warm', 'poster'],
    }),
  )
  vi.mocked(getGalleryItem).mockResolvedValue(item)
})
afterEach(cleanup)
window.scrollTo = () => undefined
async function open(signedIn = true, url = '/items/item') {
  const root = createRootRoute({
    beforeLoad: (): Promise<{
      contactUrl: string | null
      inboxCount: number
      owner: Owner | null
    }> =>
      Promise.resolve({
        contactUrl: null,
        inboxCount: 0,
        owner: signedIn ? owner : null,
      }),
  })
  const routeTree = root.addChildren([
    createRoute({
      component: () => <p>Gallery home</p>,
      getParentRoute: () => root,
      path: '/',
    }),
    createRoute({
      ...Route.options,
      getParentRoute: () => root,
      path: '/items/$id',
    }),
  ])
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [url] }),
    routeTree,
  })
  await act(() => router.load())
  render(<RouterProvider router={router as never} />)
  return router
}
it('shows no edit, visibility or delete controls to visitors', async () => {
  await open(false)
  expect(screen.getByRole('heading', { name: 'Original' })).toBeTruthy()
  expect(screen.queryByRole('region', { name: 'Manage item' })).toBeNull()
  expect(getOwnerItem).not.toHaveBeenCalled()
})
it('saves inline edits and refreshes the displayed item', async () => {
  vi.mocked(saveItemEdits).mockImplementation(options => {
    editor = { ...editor, ...(options?.data as ItemEditorData) }
    item = { ...item, title: editor.title }
    return Promise.resolve()
  })
  await open()
  fireEvent.click(screen.getByRole('button', { name: 'Edit item' }))
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Updated' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(await screen.findByRole('heading', { name: 'Updated' })).toBeTruthy()
  expect(saveItemEdits).toHaveBeenCalledWith({
    data: expect.objectContaining({ id: 'item', title: 'Updated' }),
  })
})
it('opens straight into the edit form from ?edit=true and drops it after saving', async () => {
  vi.mocked(saveItemEdits).mockImplementation(options => {
    editor = { ...editor, ...(options?.data as ItemEditorData) }
    item = { ...item, title: editor.title }
    return Promise.resolve()
  })
  const router = await open(true, '/items/item?edit=true')
  expect(screen.getByRole('button', { name: 'Cancel editing' })).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'From the inbox' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(
    await screen.findByRole('heading', { name: 'From the inbox' }),
  ).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Edit item' })).toBeTruthy()
  expect(router.state.location.search).toEqual({})
})
it('hides and republishes from the same detail page', async () => {
  vi.mocked(changeItemVisibility).mockImplementation(options => {
    const data = options?.data as ItemEditorData | undefined
    if (!data) {
      throw new Error('Missing visibility data')
    }
    editor = { ...editor, status: data.status }
    return Promise.resolve()
  })
  await open()
  fireEvent.click(screen.getByRole('button', { name: 'Move to inbox' }))
  expect(
    await screen.findByRole('button', { name: 'Publish item' }),
  ).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Publish item' }))
  expect(
    await screen.findByRole('button', { name: 'Move to inbox' }),
  ).toBeTruthy()
})
it('requires confirmation and navigates away only after deleting', async () => {
  await open()
  fireEvent.click(screen.getByRole('button', { name: 'Delete item' }))
  expect(await screen.findByRole('alertdialog')).toBeTruthy()
  expect(permanentlyDeleteItem).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  expect(permanentlyDeleteItem).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Delete item' }))
  fireEvent.click(
    await screen.findByRole('button', { name: 'Delete permanently' }),
  )
  expect(await screen.findByText('Gallery home')).toBeTruthy()
  expect(permanentlyDeleteItem).toHaveBeenCalledWith({ data: { id: 'item' } })
})
it('keeps the delete dialog open when deletion fails and allows a retry', async () => {
  vi.mocked(permanentlyDeleteItem)
    .mockRejectedValueOnce(new Error('R2 unavailable'))
    .mockResolvedValueOnce(undefined)
  await open()
  fireEvent.click(screen.getByRole('button', { name: 'Delete item' }))
  fireEvent.click(
    await screen.findByRole('button', { name: 'Delete permanently' }),
  )
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(screen.getByRole('alertdialog')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
  expect(await screen.findByText('Gallery home')).toBeTruthy()
})

it('suggests existing tags and allows creating a new tag', async () => {
  await open()
  fireEvent.click(screen.getByRole('button', { name: 'Edit item' }))
  const input = screen.getByRole('combobox', { name: 'Tags' })
  act(() => input.focus())
  fireEvent.change(input, { target: { value: 'pos' } })
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  fireEvent.click(await screen.findByRole('option', { name: 'poster' }))
  fireEvent.change(input, { target: { value: 'new tag' } })
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  fireEvent.click(
    await screen.findByRole('option', { name: 'Create “new tag”' }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() =>
    expect(saveItemEdits).toHaveBeenCalledWith({
      data: expect.objectContaining({ tags: ['warm', 'poster', 'new tag'] }),
    }),
  )
})

it.each(['published', 'inbox'] as const)(
  'preserves unsaved edits by disabling visibility changes while editing a %s item',
  async status => {
    editor.status = status
    await open()
    const label = status === 'published' ? 'Move to inbox' : 'Publish item'
    expect(
      (screen.getByRole('button', { name: label }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Edit item' }))
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Unsaved title' },
    })
    fireEvent.change(screen.getByLabelText('Note'), {
      target: { value: 'Unsaved note' },
    })
    const visibility = screen.getByRole('button', {
      name: label,
    }) as HTMLButtonElement
    expect(visibility.disabled).toBe(true)
    fireEvent.click(visibility)
    expect(changeItemVisibility).not.toHaveBeenCalled()
    expect(screen.getByDisplayValue('Unsaved title')).toBeTruthy()
    expect(screen.getByDisplayValue('Unsaved note')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(saveItemEdits).toHaveBeenCalledWith({
        data: expect.objectContaining({
          note: 'Unsaved note',
          title: 'Unsaved title',
        }),
      }),
    )
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: label }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit item' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel editing' }))
    expect(
      (screen.getByRole('button', { name: label }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)
  },
)
it('keeps edit errors out of the delete dialog and preserves them after cancellation', async () => {
  vi.mocked(saveItemEdits).mockRejectedValueOnce(new Error('Save failed'))
  await open()
  fireEvent.click(screen.getByRole('button', { name: 'Edit item' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(await screen.findByRole('alert')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Delete item' }))
  const dialog = await screen.findByRole('alertdialog')
  expect(within(dialog).queryByRole('alert')).toBeNull()
  expect(permanentlyDeleteItem).not.toHaveBeenCalled()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  expect(screen.getByRole('alert').textContent).toContain('Could not update')
})
it('clears a failed delete error when cancelling or reopening the confirmation', async () => {
  vi.mocked(permanentlyDeleteItem).mockRejectedValueOnce(
    new Error('Delete failed'),
  )
  await open()
  fireEvent.click(screen.getByRole('button', { name: 'Delete item' }))
  fireEvent.click(
    await screen.findByRole('button', { name: 'Delete permanently' }),
  )
  expect(await screen.findByRole('alert')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  expect(screen.queryByRole('alert')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Delete item' }))
  const dialog = await screen.findByRole('alertdialog')
  expect(within(dialog).queryByRole('alert')).toBeNull()
  expect(permanentlyDeleteItem).toHaveBeenCalledTimes(1)
})

it('validates credit inline, blocks invalid submits and revalidates corrections', async () => {
  await open()
  fireEvent.click(screen.getByRole('button', { name: 'Edit item' }))
  const credit = screen.getByLabelText('Credit URL')
  fireEvent.change(credit, { target: { value: 'javascript:alert(1)' } })
  fireEvent.blur(credit)
  expect(await screen.findByText('Use an http(s) credit URL.')).toBeTruthy()
  expect(credit.getAttribute('aria-invalid')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(saveItemEdits).not.toHaveBeenCalled())
  fireEvent.change(credit, { target: { value: 'https://example.com/artist' } })
  await waitFor(() =>
    expect(screen.queryByText('Use an http(s) credit URL.')).toBeNull(),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() =>
    expect(saveItemEdits).toHaveBeenCalledWith({
      data: expect.objectContaining({
        creditUrl: 'https://example.com/artist',
      }),
    }),
  )
})
it('resets field values and validation when editing is cancelled', async () => {
  await open()
  fireEvent.click(screen.getByRole('button', { name: 'Edit item' }))
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Unsaved' },
  })
  const credit = screen.getByLabelText('Credit URL')
  fireEvent.change(credit, { target: { value: 'invalid' } })
  fireEvent.blur(credit)
  expect(await screen.findByText('Use an http(s) credit URL.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel editing' }))
  fireEvent.click(screen.getByRole('button', { name: 'Edit item' }))
  expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe(
    'Original',
  )
  expect((screen.getByLabelText('Credit URL') as HTMLInputElement).value).toBe(
    '',
  )
  expect(screen.queryByText('Use an http(s) credit URL.')).toBeNull()
  expect(saveItemEdits).not.toHaveBeenCalled()
})
it('uses form submission state to disable controls and prevent duplicate saves', async () => {
  let finish: (() => void) | undefined
  vi.mocked(saveItemEdits).mockImplementation(
    () =>
      new Promise<void>(resolve => {
        finish = resolve
      }),
  )
  await open()
  fireEvent.click(screen.getByRole('button', { name: 'Edit item' }))
  const title = screen.getByLabelText('Title')
  fireEvent.change(title, { target: { value: 'Updated' } })
  const submit = screen.getByRole('button', { name: 'Save changes' })
  fireEvent.click(submit)
  await waitFor(() => expect(saveItemEdits).toHaveBeenCalledTimes(1))
  expect(
    (screen.getByRole('button', { name: 'Saving…' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)
  expect(
    (
      screen.getByRole('button', {
        name: 'Cancel editing',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true)
  expect(
    (screen.getByRole('button', { name: 'Delete item' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)
  fireEvent.submit(title.closest('form') as HTMLFormElement)
  expect(saveItemEdits).toHaveBeenCalledTimes(1)
  await act(async () => finish?.())
  expect(await screen.findByRole('button', { name: 'Edit item' })).toBeTruthy()
})

it.each(['poster', 'random'])(
  'selects %s with Enter without saving edits',
  async tag => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Edit item' }))
    const input = screen.getByRole('combobox', { name: 'Tags' })
    act(() => input.focus())
    fireEvent.input(input, {
      data: tag,
      inputType: 'insertText',
      target: { value: tag },
    })
    const option = await screen.findByRole('option', {
      name: tag === 'poster' ? tag : `Create “${tag}”`,
    })
    await waitFor(() =>
      expect(option.hasAttribute('data-highlighted')).toBe(true),
    )
    expect(fireEvent.keyDown(input, { key: 'Enter' })).toBe(false)
    expect(screen.getByLabelText(`Remove ${tag}`)).toBeTruthy()
    expect(saveItemEdits).not.toHaveBeenCalled()
    expect(fireEvent.keyDown(input, { key: 'Enter' })).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(saveItemEdits).toHaveBeenCalledWith({
        data: expect.objectContaining({ tags: ['warm', tag] }),
      }),
    )
  },
)
