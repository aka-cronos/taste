import { oauthProviderClient } from '@better-auth/oauth-provider/client'
import { createAuthClient } from 'better-auth/react'

// Same origin as the site, so no base URL is needed.
export const authClient = createAuthClient({ plugins: [oauthProviderClient()] })
