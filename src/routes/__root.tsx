import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useLocation,
  useRouteContext,
  useRouter,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { Toaster } from '@/components/ui/sonner'
import { authClient } from '@/lib/auth/client'
import { NOT_AUTHORIZED, NOT_AUTHORIZED_MESSAGE } from '@/lib/auth/owner'
import { getOwner } from '@/lib/auth/session'
import { getContactUrl } from '@/lib/site-config'
import { themeInitScript } from '@/lib/theme'
import appCss from '@/styles.css?url'

export const Route = createRootRoute({
  beforeLoad: async () => {
    const [owner, contactUrl] = await Promise.all([getOwner(), getContactUrl()])
    return { contactUrl, owner }
  },
  component: RootLayout,
  head: () => ({
    links: [{ href: appCss, rel: 'stylesheet' }],
    meta: [
      { charSet: 'utf-8' },
      { content: 'width=device-width, initial-scale=1', name: 'viewport' },
      { title: 'Taste' },
      { content: 'A personal reference gallery.', name: 'description' },
    ],
  }),
  shellComponent: RootDocument,
})

function authErrorMessage(error: unknown) {
  if (!error) {
    return null
  }
  return error === NOT_AUTHORIZED
    ? NOT_AUTHORIZED_MESSAGE
    : 'Sign-in failed. Please try again.'
}

function RootLayout() {
  const router = useRouter()
  const owner = useRouteContext({
    from: '__root__',
    select: context => context.owner,
  })
  const authError = useLocation({
    select: location =>
      authErrorMessage((location.search as { error?: unknown }).error),
  })

  return (
    <>
      <SiteHeader
        authError={owner ? null : authError}
        onSignIn={() =>
          authClient.signIn.social({
            callbackURL: '/',
            errorCallbackURL: '/',
            provider: 'google',
          })
        }
        onSignOut={async () => {
          await authClient.signOut()
          await router.invalidate()
        }}
        owner={owner}
      />
      <Outlet />
      <SiteFooter contactUrl={Route.useRouteContext().contactUrl} />
    </>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang='en' suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static theme bootstrap, no user input */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Toaster />
        <Scripts />
      </body>
    </html>
  )
}
