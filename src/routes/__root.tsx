import { type QueryClient, useSuspenseQuery } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
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
import { bootstrapQuery } from '@/lib/queries'
import { resetSession } from '@/lib/query-client'
import { themeInitScript } from '@/lib/theme'
import appCss from '@/styles.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    beforeLoad: async ({ context }) => {
      await context.queryClient.ensureQueryData(bootstrapQuery())
      return context.queryClient.fetchQuery(bootstrapQuery())
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
  },
)

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
  const { queryClient } = useRouteContext({ from: '__root__' })
  const {
    data: { owner, inboxCount, contactUrl },
  } = useSuspenseQuery(bootstrapQuery())
  const authError = useLocation({
    select: location =>
      authErrorMessage((location.search as { error?: unknown }).error),
  })

  return (
    <>
      <SiteHeader
        authError={owner ? null : authError}
        inboxCount={inboxCount}
        onSignIn={() =>
          authClient.signIn.social({
            callbackURL: '/',
            errorCallbackURL: '/',
            provider: 'google',
          })
        }
        onSignOut={async () => {
          resetSession(queryClient)
          router.clearCache()
          router.invalidate()
          try {
            await authClient.signOut()
          } finally {
            await queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
            await router.invalidate()
          }
        }}
        owner={owner}
      />
      <Outlet />
      <SiteFooter contactUrl={contactUrl} />
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
