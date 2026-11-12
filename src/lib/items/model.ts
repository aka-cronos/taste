const WHITESPACE = /\s+/gu
const LEADING_WWW = /^www\./u

export const ITEM_TYPES = ['image', 'link', 'note'] as const
export type ItemType = (typeof ITEM_TYPES)[number]

export type ItemStatus = 'inbox' | 'published'
export type ItemOrigin = 'manual' | 'agent'

/**
 * An item as the public gallery sees it. Internal fields (status, origin,
 * content hash, R2 key) never leave the server.
 */
export interface GalleryItem {
  credit: Credit | null
  description: string
  id: string
  image: GalleryImage | null
  note: string | null
  publishedAt: number
  /** The original, as an http(s) URL. */
  sourceUrl: string | null
  tags: string[]
  title: string | null
  type: ItemType
}

export interface GalleryImage {
  height: number | null
  url: string
  width: number | null
}

/** Who made the item and where to find the original. */
export interface Credit {
  /** The author's name, or the source's hostname when the author is unknown. */
  label: string
  url: string | null
}

export interface GalleryPage {
  items: GalleryItem[]
  /** Pass back to get the next page; null on the last page. */
  nextCursor: string | null
}

/** Public URL of a stored R2 object, served by the `/media/$` route. */
export function mediaUrl(key: string) {
  return `/media/${key.split('/').map(encodeURIComponent).join('/')}`
}

/**
 * Tags are unique per normalized name, so "Brutalism", " brutalism " and
 * "BRUTALISM" are the same tag.
 */
export function normalizeTagName(name: string) {
  return name.normalize('NFKC').trim().replace(WHITESPACE, ' ').toLowerCase()
}

/**
 * The URL when it is an absolute http(s) URL, otherwise null. Stored URLs
 * come from agents and pasted links, so anything else (`javascript:`, data
 * URLs, garbage) is dropped before it reaches an `href`.
 */
export function safeHttpUrl(value: string | null | undefined) {
  if (!value) {
    return null
  }
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.href
      : null
  } catch {
    return null
  }
}

export function hostnameOf(url: string) {
  return new URL(url).hostname.replace(LEADING_WWW, '')
}

/**
 * The credit to show for an item: the author when known, linked to the
 * credit URL or else the source. Null only when there is neither an author
 * nor a usable link.
 */
export function creditFor(fields: {
  creditAuthor: string | null
  creditUrl: string | null
  sourceUrl: string | null
}): Credit | null {
  const url = safeHttpUrl(fields.creditUrl) ?? safeHttpUrl(fields.sourceUrl)
  const author = fields.creditAuthor?.trim()
  if (author) {
    return { label: author, url }
  }
  return url ? { label: hostnameOf(url), url } : null
}

/**
 * True when the credit only repeats the source (no author, same link), so a
 * view that already shows the source can skip it.
 */
export function creditRepeatsSource(
  item: Pick<GalleryItem, 'credit' | 'sourceUrl'>,
) {
  const { credit, sourceUrl } = item
  return Boolean(
    credit &&
      sourceUrl &&
      credit.url === sourceUrl &&
      credit.label === hostnameOf(sourceUrl),
  )
}
