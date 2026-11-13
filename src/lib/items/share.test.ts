import { describe, expect, it } from 'vitest'
import type { GalleryItem } from '@/lib/items/model'
import { itemShareMeta, itemUrl } from '@/lib/items/share'

const ORIGIN = 'https://taste.example'

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

function tags(item: GalleryItem) {
  return Object.fromEntries(
    itemShareMeta(item, ORIGIN).map(tag => [
      'property' in tag ? tag.property : tag.name,
      tag.content,
    ]),
  )
}

describe('itemUrl', () => {
  it('is the absolute item page URL', () => {
    expect(itemUrl('abc', ORIGIN)).toBe('https://taste.example/items/abc')
    expect(itemUrl('a b/c', ORIGIN)).toBe(
      'https://taste.example/items/a%20b%2Fc',
    )
  })
})

describe('itemShareMeta', () => {
  it('gives an image item a large card with an absolute image URL and size', () => {
    const item: GalleryItem = {
      ...base,
      description: 'Orange disc poster',
      id: 'img',
      image: { height: 1200, url: '/media/k/img.png', width: 900 },
      type: 'image',
    }
    expect(tags(item)).toEqual({
      description: 'Orange disc poster',
      'og:description': 'Orange disc poster',
      'og:image': 'https://taste.example/media/k/img.png',
      'og:image:alt': 'Orange disc poster',
      'og:image:height': '1200',
      'og:image:width': '900',
      'og:site_name': 'Taste',
      'og:title': 'Orange disc poster',
      'og:type': 'article',
      'og:url': 'https://taste.example/items/img',
      'twitter:card': 'summary_large_image',
    })
  })

  it('includes a link cover as the image, leaving out unknown sizes', () => {
    const item: GalleryItem = {
      ...base,
      description: 'Why grids keep coming back.',
      id: 'lnk',
      image: { height: null, url: '/media/k/cover.png', width: null },
      sourceUrl: 'https://blog.example/grids',
      title: 'The return of the grid',
      type: 'link',
    }
    const meta = tags(item)
    expect(meta['og:title']).toBe('The return of the grid')
    expect(meta['og:image']).toBe('https://taste.example/media/k/cover.png')
    expect(meta['og:image:width']).toBeUndefined()
    expect(meta['og:image:height']).toBeUndefined()
    expect(meta['og:image:alt']).toBeUndefined()
    expect(meta['twitter:card']).toBe('summary_large_image')
  })

  it('uses a small card without an image for links without a cover', () => {
    const meta = tags({
      ...base,
      id: 'lnk',
      sourceUrl: 'https://blog.example/grids',
      type: 'link',
    })
    expect(meta['og:title']).toBe('blog.example')
    expect(meta['og:image']).toBeUndefined()
    expect(meta['og:description']).toBeUndefined()
    expect(meta['twitter:card']).toBe('summary')
  })

  it('describes a note by its text and never gives it an image', () => {
    const meta = tags({
      ...base,
      description: 'On restraint',
      id: 'nte',
      note: 'Fewer colors, more contrast.',
      title: 'Restraint',
      type: 'note',
    })
    expect(meta['og:title']).toBe('Restraint')
    expect(meta['og:description']).toBe('Fewer colors, more contrast.')
    expect(meta['og:url']).toBe('https://taste.example/items/nte')
    expect(meta['og:image']).toBeUndefined()
    expect(meta['twitter:card']).toBe('summary')
  })
})
