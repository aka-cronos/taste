import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'
import { ensureAuthSchema, getAuth } from '@/lib/auth/server'
import { protectedMcp } from '@/lib/mcp/handler'

async function handle({ request }: { request: Request }) {
  await ensureAuthSchema()
  const auth = getAuth(request)
  const { baseURL } = auth.options
  if (typeof baseURL !== 'string') {
    throw new Error('MCP requires a resolved authorization origin.')
  }
  return protectedMcp(auth, env.DB, env.OWNER_EMAIL, baseURL)(request)
}

export const Route = createFileRoute('/mcp')({
  server: { handlers: { DELETE: handle, GET: handle, POST: handle } },
})
