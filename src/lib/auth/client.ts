import { createAuthClient } from 'better-auth/react'

// Same origin as the site, so no base URL is needed.
export const authClient = createAuthClient()
