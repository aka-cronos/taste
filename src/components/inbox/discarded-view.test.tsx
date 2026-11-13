import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { DiscardEntry } from '@/lib/items/discards'
import { renderWithRouter } from '@/test/router'
import { DiscardedView } from './discarded-view'

vi.mock('@/lib/items/inbox-server', () => ({ forgetDiscarded: vi.fn() }))

afterEach(cleanup)

const NOTHING_DISCARDED = /Nothing discarded/u

const entries: DiscardEntry[] = [
  {
    discardedAt: Date.UTC(2026, 10, 12, 12),
    id: 2,
    sourceHost: 'example.com',
    sourceUrl: 'https://www.example.com/post',
    title: 'A post',
  },
  {
    discardedAt: Date.UTC(2026, 9, 1, 12),
    id: 1,
    sourceHost: null,
    sourceUrl: null,
    title: null,
  },
]

async function open(onForget = vi.fn(() => Promise.resolve())) {
  await renderWithRouter(
    <DiscardedView entries={entries} onForget={onForget} />,
  )
  return onForget
}

it('lists each discarded entry with its source and date', async () => {
  await open()
  const [post, upload] = within(
    screen.getByRole('list', { name: 'Discarded items' }),
  ).getAllByRole('listitem')
  expect(post?.textContent).toContain('A post')
  expect(
    within(post as HTMLElement)
      .getByRole('link', { name: 'example.com' })
      .getAttribute('href'),
  ).toBe('https://www.example.com/post')
  expect(post?.textContent).toContain('Nov 12, 2026')
  expect(upload?.textContent).toContain('Untitled image')
  expect(upload?.textContent).toContain('Uploaded image')
  expect(
    screen
      .getByRole('link', { name: 'Discarded' })
      .getAttribute('aria-current'),
  ).toBe('page')
})

it('forgets an entry', async () => {
  const onForget = await open()
  fireEvent.click(screen.getByRole('button', { name: 'Forget A post' }))
  await waitFor(() => expect(onForget).toHaveBeenCalledWith(2))
})

it('reports a failed forget', async () => {
  await open(vi.fn(() => Promise.reject(new Error('offline'))))
  fireEvent.click(screen.getByRole('button', { name: 'Forget A post' }))
  expect((await screen.findByRole('alert')).textContent).toBe(
    'Could not forget it. Please try again.',
  )
})

it('counts what is remembered in the shared header', async () => {
  await open()
  const header = within(screen.getByRole('banner'))
  expect(header.getByRole('heading', { name: 'Discarded' })).toBeTruthy()
  expect(header.getByText('2 items remembered.')).toBeTruthy()
})

it('explains an empty list', async () => {
  await renderWithRouter(<DiscardedView entries={[]} />)
  expect(screen.getByText(NOTHING_DISCARDED)).toBeTruthy()
  expect(
    screen.getByText('What you discard from the inbox shows up here.'),
  ).toBeTruthy()
  expect(screen.getByText('Nothing to forget.')).toBeTruthy()
  expect(screen.queryByRole('list', { name: 'Discarded items' })).toBeNull()
})
