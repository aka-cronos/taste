import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { InboxItem } from '@/lib/items/model'
import { renderWithRouter } from '@/test/router'
import { InboxView } from './inbox-view'

vi.mock('@/lib/items/inbox-server', () => ({
  discardInbox: vi.fn(),
  publishInbox: vi.fn(),
}))

afterEach(cleanup)

const EMPTY_INBOX = /Your inbox is empty/u

function item(fields: Partial<InboxItem> & { id: string }): InboxItem {
  return {
    credit: null,
    description: '',
    image: null,
    note: null,
    origin: 'agent',
    publishedAt: 1,
    sourceUrl: null,
    tags: [],
    title: null,
    type: 'note',
    ...fields,
  }
}

const items = [
  item({
    description: 'Warm brutalist poster',
    id: 'poster',
    sourceUrl: 'https://www.example.com/p/1',
    tags: ['brutalism', 'poster'],
    title: 'Poster',
    type: 'image',
  }),
  item({ id: 'note', origin: 'manual', title: 'Hidden note' }),
]

async function open(overrides: Partial<Parameters<typeof InboxView>[0]> = {}) {
  const onPublish = vi.fn(() => Promise.resolve())
  const onDiscard = vi.fn(() => Promise.resolve())
  await renderWithRouter(
    <InboxView
      count={items.length}
      items={items}
      onDiscard={onDiscard}
      onPublish={onPublish}
      {...overrides}
    />,
  )
  return { onDiscard, onPublish }
}

function row(name: string) {
  const link = screen.getAllByRole('link', { name }).at(0)
  const li = link?.closest('li')
  if (!li) {
    throw new Error(`No row for ${name}`)
  }
  return within(li)
}

it('shows each item with its origin, description, tags and an edit link', async () => {
  await open()
  const poster = row('Poster')
  expect(poster.getByText('Saved by an agent')).toBeTruthy()
  expect(poster.getByText('Warm brutalist poster')).toBeTruthy()
  expect(poster.getAllByRole('listitem').map(tag => tag.textContent)).toEqual([
    'brutalism',
    'poster',
  ])
  expect(poster.getByRole('link', { name: 'example.com' })).toBeTruthy()
  expect(poster.getByRole('link', { name: 'Edit' }).getAttribute('href')).toBe(
    '/items/poster?edit=true#edit',
  )
  expect(row('Hidden note').getByText('Added by you')).toBeTruthy()
})

it('publishes one item', async () => {
  const { onPublish } = await open()
  fireEvent.click(row('Poster').getByRole('button', { name: 'Publish' }))
  await waitFor(() => expect(onPublish).toHaveBeenCalledWith(['poster']))
})

it('bulk publishes the selected items', async () => {
  const { onPublish } = await open()
  const publish = screen.getByRole('button', { name: 'Publish selected' })
  expect(publish.hasAttribute('disabled')).toBe(true)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select all' }))
  expect(screen.getByText('2 selected')).toBeTruthy()
  fireEvent.click(publish)
  await waitFor(() =>
    expect(onPublish).toHaveBeenCalledWith(['poster', 'note']),
  )
})

it('bulk discards the selected items only after confirmation', async () => {
  const { onDiscard } = await open()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Hidden note' }))
  fireEvent.click(screen.getByRole('button', { name: 'Discard selected' }))
  const dialog = await screen.findByRole('alertdialog')
  expect(within(dialog).getByText('Discard 1 item?')).toBeTruthy()
  expect(onDiscard).not.toHaveBeenCalled()
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Discard permanently' }),
  )
  await waitFor(() => expect(onDiscard).toHaveBeenCalledWith(['note']))
})

it('reports a failed action and keeps the items', async () => {
  await open({ onPublish: () => Promise.reject(new Error('offline')) })
  fireEvent.click(row('Poster').getByRole('button', { name: 'Publish' }))
  expect((await screen.findByRole('alert')).textContent).toBe(
    'Could not publish. Please try again.',
  )
  expect(row('Poster')).toBeTruthy()
})

it('explains an empty inbox', async () => {
  await open({ count: 0, items: [] })
  expect(screen.getByText(EMPTY_INBOX)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Publish selected' })).toBeNull()
})
