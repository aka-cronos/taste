import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { testLoginPassword } from '@/lib/auth/test-login'

/** True only where the test login is on: local dev and CI. */
export const getTestLoginEnabled = createServerFn({ method: 'GET' }).handler(
  () => testLoginPassword(env) !== null,
)
