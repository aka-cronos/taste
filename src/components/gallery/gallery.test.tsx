import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GalleryGrid } from '@/components/gallery/gallery-grid'
import { ItemCard } from '@/components/gallery/item-card'
import { ItemDetail } from '@/components/gallery/item-detail'
import type { GalleryItem } from '@/lib/items/model'
import { mockViewport } from '@/test/media-query'
import { renderWithRouter } from '@/test/router'

beforeEach(() => mockViewport())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const base = {
  credit: null,
  description: '',
  image: null,
  note: null,
  publishedAt: 1,
  sourceUrl: null,
  tags: [],
  title: null,
} satisfies Partial<GalleryItem>

const image: GalleryItem = {
  ...base,
  credit: { label: 'Ana', url: 'https://ana.example/' },
  description: 'Orange disc poster',
  id: 'img',
  image: { height: 1200, url: '/media/k/img.png', width: 900 },
  sourceUrl: 'https://x.example/ana/1',
  tags: ['poster', 'warm'],
  type: 'image',
}

const link: GalleryItem = {
  ...base,
  credit: { label: 'blog.example', url: 'https://blog.example/grids' },
  description: 'Why grids keep coming back.',
  id: 'lnk',
  image: { height: 630, url: '/media/k/cover.png', width: 1200 },
  sourceUrl: 'https://blog.example/grids',
  title: 'The return of the grid',
  type: 'link',
}

const note: GalleryItem = {
  ...base,
  description: 'On restraint',
  id: 'nte',
  note: 'Fewer colors, more contrast.',
  title: 'Restraint',
  type: 'note',
}

describe('ItemCard', () => {
  it('renders an image with its credit and links to its detail view', async () => {
    await renderWithRouter(<ItemCard item={image} />)
    const card = screen.getByRole('link', { name: 'Orange disc poster' })
    expect(card.getAttribute('href')).toBe('/items/img')
    const img = within(card).getByRole('img')
    expect(img.getAttribute('src')).toBe('/media/k/img.png')
    expect(img.getAttribute('width')).toBe('900')
    expect(screen.getByText('Ana')).toBeTruthy()
  })

  it('renders a link card with cover, title and hostname, once', async () => {
    await renderWithRouter(<ItemCard item={link} />)
    const card = screen.getByRole('link', { name: 'The return of the grid' })
    expect(card.querySelector('img')?.getAttribute('src')).toBe(
      '/media/k/cover.png',
    )
    expect(screen.getAllByText('blog.example')).toHaveLength(1)
  })

  it('renders a note card with its text', async () => {
    await renderWithRouter(<ItemCard item={note} />)
    const card = screen.getByRole('link', { name: 'Restraint' })
    expect(within(card).getByText('Fewer colors, more contrast.')).toBeTruthy()
  })
})

describe('ItemDetail', () => {
  it('shows an image large with tags and a linked credit', async () => {
    await renderWithRouter(<ItemDetail item={image} />)
    expect(
      screen
        .getByRole('img', { name: 'Orange disc poster' })
        .getAttribute('src'),
    ).toBe('/media/k/img.png')
    const tags = screen.getByRole('list', { name: 'Tags' })
    expect(
      within(tags)
        .getAllByRole('listitem')
        .map(li => li.textContent),
    ).toEqual(['poster', 'warm'])
    const credit = screen.getByRole('link', { name: 'Ana' })
    expect(credit.getAttribute('href')).toBe('https://ana.example/')
    expect(credit.getAttribute('rel')).toContain('noopener')
    expect(
      screen.getByRole('link', { name: 'x.example' }).getAttribute('href'),
    ).toBe('https://x.example/ana/1')
  })

  it('shows a link preview that opens the original', async () => {
    await renderWithRouter(<ItemDetail item={link} />)
    expect(
      screen.getByRole('heading', { name: 'The return of the grid' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'Open link' }).getAttribute('href'),
    ).toBe('https://blog.example/grids')
    expect(
      screen.getByRole('link', { name: 'blog.example' }).getAttribute('href'),
    ).toBe('https://blog.example/grids')
  })

  it('shows a note with its description', async () => {
    await renderWithRouter(<ItemDetail item={note} />)
    expect(screen.getByText('Fewer colors, more contrast.')).toBeTruthy()
    expect(screen.getByText('On restraint')).toBeTruthy()
  })
})

describe('GalleryGrid', () => {
  it('says so when there is nothing to show', async () => {
    await renderWithRouter(
      <GalleryGrid
        initialPage={{ items: [], nextCursor: null }}
        loadPage={vi.fn()}
      />,
    )
    expect(screen.getByText('Nothing here yet.')).toBeTruthy()
  })

  it('mixes all item types and loads the next page on demand', async () => {
    const loadPage = vi.fn(() =>
      Promise.resolve({ items: [note], nextCursor: null }),
    )
    await renderWithRouter(
      <GalleryGrid
        initialPage={{ items: [image, link], nextCursor: 'next' }}
        loadPage={loadPage}
      />,
    )
    expect(screen.getAllByRole('article')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
    expect(await screen.findByRole('link', { name: 'Restraint' })).toBeTruthy()
    expect(loadPage).toHaveBeenCalledWith('next')
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull()
  })
})

it.each([375, 640, 1024, 1280])(
  'places two cards in separate columns at %s px',
  async width => {
    mockViewport(width)
    await renderWithRouter(
      <GalleryGrid
        initialPage={{ items: [image, note], nextCursor: null }}
        loadPage={vi.fn()}
      />,
    )
    const [first, second] = screen.getAllByRole('article')
    expect(first?.parentElement).not.toBe(second?.parentElement)
    expect(within(first as HTMLElement).getByText('Ana')).toBeTruthy()
  },
)

it('redistributes cards on resize and appends pages to the columns', async () => {
  const resize = mockViewport(1280)
  const items = Array.from({ length: 10 }, (_, i) => ({
    ...note,
    id: `note-${i}`,
    title: `Note ${i}`,
  }))
  const loadPage = vi.fn().mockResolvedValue({
    items: [{ ...note, id: 'extra', title: 'Extra' }],
    nextCursor: null,
  })
  await renderWithRouter(
    <GalleryGrid
      initialPage={{ items, nextCursor: 'next' }}
      loadPage={loadPage}
    />,
  )
  const columns = () => [
    ...(screen.getAllByRole('article')[0]?.parentElement?.parentElement
      ?.children ?? []),
  ]
  expect(columns().map(column => column.children.length)).toEqual([
    2, 2, 2, 2, 2,
  ])
  await act(() => resize(375))
  expect(columns().map(column => column.children.length)).toEqual([5, 5])
  expect(columns()[0]?.textContent).toContain('Note 2')
  fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
  await screen.findByRole('link', { name: 'Extra' })
  expect(columns().map(column => column.children.length)).toEqual([6, 5])
})
