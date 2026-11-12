import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'
import { ownerFromHeaders } from '@/lib/auth/request'
import { serveMedia } from '@/lib/items/media'

// Stored images, served from R2. See serveMedia for who sees what.
export const Route = createFileRoute('/media/$')({
  server: {
    handlers: {
      GET: ({ params, request }) =>
        serveMedia({
          bucket: env.BUCKET,
          db: env.DB,
          isOwner: async () =>
            (await ownerFromHeaders(request.headers)) !== null,
          key: params._splat ?? '',
          request,
        }),
    },
  },
})
