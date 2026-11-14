import { createFileRoute } from '@tanstack/react-router'
import { toIssuerDiscovery } from '@/lib/auth/discovery'
import { ensureAuthSchema, getAuth } from '@/lib/auth/server'

async function handle({ request }: { request: Request }) {
  await ensureAuthSchema()
  return getAuth(request).handler(toIssuerDiscovery(request))
}

export const Route = createFileRoute('/.well-known/$')({
  server: { handlers: { GET: handle, HEAD: handle } },
})
