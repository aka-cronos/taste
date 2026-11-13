import { createIsomorphicFn } from '@tanstack/react-start'
import { getRequestUrl } from '@tanstack/react-start/server'

/**
 * The site's origin (`https://host`): the request's origin on the server,
 * the page's origin in the browser. Use it to turn relative paths into the
 * absolute URLs that share links and Open Graph tags need.
 */
export const getRequestOrigin = createIsomorphicFn()
  .server(() => getRequestUrl().origin)
  .client(() => window.location.origin)
