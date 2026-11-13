import { type GalleryItem, itemLabel } from '@/lib/items/model'

/** Path of an item's page: the canonical link to share. */
export function itemPath(id: string) {
  return `/items/${encodeURIComponent(id)}`
}

/** Absolute URL of an item's page on `origin`. */
export function itemUrl(id: string, origin: string) {
  return new URL(itemPath(id), origin).href
}

type Meta =
  | { content: string; name: string }
  | { content: string; property: string }

/**
 * Open Graph and Twitter card tags for a published item's page, with
 * absolute URLs on `origin`. Notes and links without a cover have no image.
 */
export function itemShareMeta(item: GalleryItem, origin: string): Meta[] {
  const title = itemLabel(item)
  const description =
    item.type === 'note' ? item.note || item.description : item.description
  const image = item.type === 'note' ? null : item.image
  const meta: Meta[] = [
    { content: title, property: 'og:title' },
    { content: 'article', property: 'og:type' },
    { content: itemUrl(item.id, origin), property: 'og:url' },
    { content: 'Taste', property: 'og:site_name' },
  ]
  if (description) {
    meta.push(
      { content: description, name: 'description' },
      { content: description, property: 'og:description' },
    )
  }
  if (image) {
    meta.push({
      content: new URL(image.url, origin).href,
      property: 'og:image',
    })
    if (image.width && image.height) {
      meta.push(
        { content: String(image.width), property: 'og:image:width' },
        { content: String(image.height), property: 'og:image:height' },
      )
    }
    if (item.type === 'image') {
      meta.push({ content: title, property: 'og:image:alt' })
    }
  }
  meta.push({
    content: image ? 'summary_large_image' : 'summary',
    name: 'twitter:card',
  })
  return meta
}
