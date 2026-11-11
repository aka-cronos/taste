import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { themeInitScript } from '@/lib/theme'
import appCss from '@/styles.css?url'

export const Route = createRootRoute({
  component: Outlet,
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
        <Scripts />
      </body>
    </html>
  )
}
