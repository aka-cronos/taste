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
async function open(signedIn = true) {
  const root = createRootRoute({
    beforeLoad: (): Promise<{
      contactUrl: string | null
      owner: Owner | null
    }> => Promise.resolve({ contactUrl: null, owner: signedIn ? owner : null }),
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
    history: createMemoryHistory({ initialEntries: ['/items/item'] }),
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
