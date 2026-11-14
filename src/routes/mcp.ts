import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'
import { ensureAuthSchema, getAuth } from '@/lib/auth/server'
import { protectedMcp } from '@/lib/mcp/handler'

async function handle({ request }: { request: Request }) {
  await ensureAuthSchema()
  return protectedMcp(
    getAuth(),
    env.DB,
    env.OWNER_EMAIL,
    env.BETTER_AUTH_URL,
  )(request)
}

export const Route = createFileRoute('/mcp')({
  server: { handlers: { DELETE: handle, GET: handle, POST: handle } },
})
