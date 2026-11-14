import { createFileRoute } from '@tanstack/react-router'
import { ensureAuthSchema, getAuth } from '@/lib/auth/server'

async function handle({ request }: { request: Request }) {
  await ensureAuthSchema()
  return getAuth().handler(request)
}

export const Route = createFileRoute('/.well-known/$')({
  server: { handlers: { GET: handle, HEAD: handle } },
})
