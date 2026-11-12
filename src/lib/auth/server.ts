import { env } from 'cloudflare:workers'
import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'
import { createAuthOptions } from '@/lib/auth/options'

let instance: ReturnType<typeof createAuth> | undefined
let migrated: Promise<void> | undefined

function createAuth() {
  return betterAuth(createAuthOptions(env))
}

/** The Better Auth instance, created once per isolate. */
export function getAuth() {
  instance ??= createAuth()
  return instance
}

/**
 * Creates or updates the Better Auth tables in D1. Runs once per isolate; the
 * schema check is a couple of batched PRAGMA queries when nothing changed.
 */
export function ensureAuthSchema() {
  migrated ??= getMigrations(createAuthOptions(env))
    .then(({ runMigrations }) => runMigrations())
    .catch((error: unknown) => {
      migrated = undefined
      throw error
    })
  return migrated
}
