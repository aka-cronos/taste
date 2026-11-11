import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'

// Confirms the Worker can reach its D1 and R2 bindings.
export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => {
        const [db, bucket] = await Promise.allSettled([
          env.DB.prepare('SELECT 1').first(),
          env.BUCKET.list({ limit: 1 }),
        ])
        const ok = db.status === 'fulfilled' && bucket.status === 'fulfilled'
        return Response.json(
          {
            d1: db.status === 'fulfilled',
            ok,
            r2: bucket.status === 'fulfilled',
          },
          { headers: { 'cache-control': 'no-store' }, status: ok ? 200 : 503 },
        )
      },
    },
  },
})
