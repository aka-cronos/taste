import { createFileRoute } from '@tanstack/react-router'
import { ensureAuthSchema, getAuth } from '@/lib/auth/server'

async function handle({ request }: { request: Request }) {
  await ensureAuthSchema()
  return getAuth().handler(request)
}

// Better Auth endpoints: Google sign-in, its callback, session and sign-out.
export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: handle,
      POST: handle,
    },
  },
})
