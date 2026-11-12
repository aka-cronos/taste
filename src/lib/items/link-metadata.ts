import { decodeHTML, decodeHTMLAttribute } from 'entities'
import {
  fetchPublicUrl,
  MAX_IMAGE_BYTES,
  MAX_PAGE_BYTES,
  publicUrl,
} from '@/lib/items/fetch-url'

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
  if (!matches || bytes.length > MAX_IMAGE_BYTES) {
    throw new Error('Choose a PNG, JPEG, GIF or WebP image up to 10 MB.')
  }
}

export async function fetchLinkMetadata(sourceUrl: string) {
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
  const { cover } = metadata
  let image: StoredImage | undefined
  if (cover) {
    try {
      image = await fetchPublicUrl(
        publicUrl(new URL(cover, sourceUrl).href).href,
        MAX_IMAGE_BYTES,
      )
      validateImage(image)
    } catch {
      image = undefined
    }
  }
  return { description: metadata.description, image, title: metadata.title }
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
