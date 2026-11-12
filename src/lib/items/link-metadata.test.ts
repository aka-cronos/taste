// @vitest-environment node
import { expect, it } from 'vitest'
import { pageMetadata, validateImage } from '@/lib/items/link-metadata'

it('uses decoded Open Graph metadata with regular and Twitter fallbacks', () => {
  expect(
    pageMetadata(
      new Map([
        ['og:title', 'Film & type'],
        ['description', 'A reference'],
        ['twitter:image', '/thumb.png'],
      ]),
      'Fallback',
    ),
  ).toEqual({
    cover: '/thumb.png',
    description: 'A reference',
    title: 'Film & type',
  })
  expect(pageMetadata(new Map(), ' Art &amp; type &#x1f3a8; ')).toEqual({
    cover: undefined,
    description: '',
    title: 'Art & type 🎨',
  })
  expect(pageMetadata(new Map(), '')).toMatchObject({ title: null })
})

it('bounds extracted metadata', () => {
  expect(
    pageMetadata(
      new Map([
        ['og:title', 'x'.repeat(600)],
        ['og:description', 'x'.repeat(11_000)],
      ]),
      '',
    ).title,
  ).toHaveLength(500)
  expect(
    pageMetadata(new Map([['description', 'x'.repeat(11_000)]]), '')
      .description,
  ).toHaveLength(10_000)
})

it('rejects active formats and mismatched image types', () => {
  expect(() =>
    validateImage({
      bytes: new TextEncoder().encode('<svg onload="alert(1)"/>'),
      contentType: 'image/svg+xml',
    }),
  ).toThrow('Choose a PNG')
  expect(() =>
    validateImage({
      bytes: new TextEncoder().encode('<html>not an image</html>'),
      contentType: 'image/png',
    }),
  ).toThrow('Choose a PNG')
  expect(() =>
    validateImage({
      bytes: new TextEncoder().encode('GIF89a'),
      contentType: 'image/gif',
    }),
  ).not.toThrow()
})
