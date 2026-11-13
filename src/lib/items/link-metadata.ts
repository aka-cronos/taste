import { decodeHTML, decodeHTMLAttribute } from 'entities'
import { z } from 'zod'
import {
  fetchPublicUrl,
  MAX_PAGE_BYTES,
  publicUrl,
  UnsafeUrlError,
} from '@/lib/items/fetch-url'
import { IMAGE_ERROR, imageSchema, MAX_IMAGE_BYTES } from '@/lib/items/input'

const TRAILING_DOT = /\.$/u
const YOUTUBE_VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/u
const youtubeMetadataSchema = z.object({
  thumbnail_url: z.string().optional(),
  title: z.string(),
})

const GIF_SIGNATURE = /^GIF8[79]a$/u

export interface StoredImage {
  bytes: Uint8Array
  contentType: string
}

export function validateImage(image: StoredImage) {
  const { bytes, contentType } = image
  const signature = Array.from(bytes.subarray(0, 12))
  const matches =
    (contentType === 'image/png' &&
      signature.slice(0, 8).join() === '137,80,78,71,13,10,26,10') ||
    (contentType === 'image/jpeg' &&
      signature.slice(0, 3).join() === '255,216,255') ||
    (contentType === 'image/gif' &&
      new TextDecoder().decode(bytes.subarray(0, 6)).match(GIF_SIGNATURE)) ||
    (contentType === 'image/webp' &&
      new TextDecoder().decode(bytes.subarray(0, 4)) === 'RIFF' &&
      new TextDecoder().decode(bytes.subarray(8, 12)) === 'WEBP')
  const validFile = imageSchema.safeParse(
    new File([new Uint8Array(bytes)], 'image', { type: contentType }),
  ).success
  if (!(matches && validFile)) {
    throw new Error(IMAGE_ERROR)
  }
}

function youtubeVideoUrl(url: URL) {
  const host = url.hostname.replace(TRAILING_DOT, '')
  let id: string | null = null
  if (
    ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host) &&
    url.pathname === '/watch'
  ) {
    id = url.searchParams.get('v')
  } else if (host === 'youtu.be') {
    id = url.pathname.slice(1)
  }
  return id && YOUTUBE_VIDEO_ID.test(id)
    ? `https://www.youtube.com/watch?v=${id}`
    : null
}

async function fetchCover(cover: string | undefined, sourceUrl: string) {
  if (!cover) {
    return
  }
  try {
    const image = await fetchPublicUrl(
      publicUrl(new URL(cover, sourceUrl).href).href,
      MAX_IMAGE_BYTES,
    )
    validateImage(image)
    return image
  } catch {
    // Cover art is optional when the destination or image fails validation.
  }
}

async function fetchYoutubeMetadata(videoUrl: string) {
  let title: string | null = null
  let cover: string | undefined
  try {
    const endpoint = new URL('https://www.youtube.com/oembed')
    endpoint.searchParams.set('url', videoUrl)
    endpoint.searchParams.set('format', 'json')
    const page = await fetchPublicUrl(endpoint.href, MAX_PAGE_BYTES)
    if (page.contentType !== 'application/json') {
      throw new Error('YouTube metadata must be JSON.')
    }
    const metadata = youtubeMetadataSchema.parse(
      JSON.parse(new TextDecoder().decode(page.bytes)),
    )
    title = metadata.title.trim().slice(0, 500) || null
    cover = metadata.thumbnail_url
  } catch {
    // YouTube metadata is optional: blocked or unavailable videos can still be saved.
  }
  return { description: '', image: await fetchCover(cover, videoUrl), title }
}

export async function fetchLinkMetadata(sourceUrl: string) {
  const url = publicUrl(sourceUrl)
  const videoUrl = youtubeVideoUrl(url)
  if (videoUrl) {
    return fetchYoutubeMetadata(videoUrl)
  }
  try {
    return await fetchPageMetadata(url.href)
  } catch (error) {
    if (error instanceof UnsafeUrlError) {
      throw error
    }
    return { description: '', image: undefined, title: null }
  }
}

async function fetchPageMetadata(sourceUrl: string) {
  const page = await fetchPublicUrl(sourceUrl, MAX_PAGE_BYTES)
  if (
    page.contentType !== 'text/html' &&
    page.contentType !== 'application/xhtml+xml'
  ) {
    throw new Error('The URL must point to a web page.')
  }
  const values = new Map<string, string>()
  let title = ''
  // biome-ignore lint/correctness/noUndeclaredVariables: native Cloudflare Workers API
  await new HTMLRewriter()
    .on('meta', {
      element(element) {
        const key =
          element.getAttribute('property') ?? element.getAttribute('name')
        const value = element.getAttribute('content')
        if (key && value && !values.has(key.toLowerCase())) {
          values.set(key.toLowerCase(), decodeHTMLAttribute(value))
        }
      },
    })
    .on('title', {
      text(chunk) {
        title += chunk.text
      },
    })
    .transform(
      new Response(page.bytes, { headers: { 'content-type': 'text/html' } }),
    )
    .arrayBuffer()
  const metadata = pageMetadata(values, title)
  return {
    description: metadata.description,
    image: await fetchCover(metadata.cover, sourceUrl),
    title: metadata.title,
  }
}

export function pageMetadata(values: Map<string, string>, title: string) {
  return {
    cover: values.get('og:image') ?? values.get('twitter:image'),
    description: (
      values.get('og:description') ??
      values.get('description') ??
      ''
    ).slice(0, 10_000),
    title:
      (values.get('og:title') ?? decodeHTML(title)).trim().slice(0, 500) ||
      null,
  }
}
