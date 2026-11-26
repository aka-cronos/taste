import { env } from 'cloudflare:workers'
import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'
import { bindsAuthToRequest, createAuthOptions } from '@/lib/auth/options'
import { createSchemaGate } from '@/lib/auth/schema-gate'

let instance: ReturnType<typeof createAuth> | undefined

function createAuth(request?: Request) {
  return betterAuth(createAuthOptions(env, request))
}

/** Preview and local requests bind OAuth and MCP to their validated origin. */
export function getAuth(request?: Request) {
  if (request && bindsAuthToRequest(env)) {
    return createAuth(request)
  }
  instance ??= createAuth()
  return instance
}

/**
 * Creates or updates the Better Auth tables in D1. Runs until it succeeds once
 * per isolate; the schema check is a couple of batched PRAGMA queries when
 * nothing changed.
 */
export const ensureAuthSchema = createSchemaGate(async () => {
  const { runMigrations } = await getMigrations(createAuthOptions(env))
  await runMigrations()
})
