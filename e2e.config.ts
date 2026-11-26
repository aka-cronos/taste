import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'

// Point APP_URL at a running app to reuse it; otherwise the runner starts
// the dev server on a free port, so worktrees and CI never collide.
const appUrl = process.env.APP_URL

// The dev server reads `.dev.vars`; the runner does not, so the test login
// credentials come from the environment first and `.dev.vars` second.
const devVars = existsSync('.dev.vars')
  ? parseEnv(readFileSync('.dev.vars', 'utf8'))
  : {}
const fromEnv = (name: string) => process.env[name] || devVars[name] || ''

export default {
  credentials: {
    // Signs in at `/test-login` (local dev and CI only, see #93). The
    // password is read only when a test types it, so runs without it still
    // load the config.
    owner: {
      password: () => {
        const password = fromEnv('TEST_LOGIN_PASSWORD')
        if (!password) {
          throw new Error(
            'Set TEST_LOGIN_PASSWORD in .dev.vars to sign in as the owner.',
          )
        }
        return password
      },
      username: fromEnv('OWNER_EMAIL') || 'owner@example.com',
    },
  },
  targets: [
    {
      app: appUrl
        ? { url: appUrl }
        : {
            command: {
              args: [
                'exec',
                'vite',
                'dev',
                '--host',
                '127.0.0.1',
                '--port',
                '{port}',
                '--strictPort',
              ],
              executable: 'pnpm',
              log: '.e2e/logs/app.log',
              startupTimeout: 120_000,
            },
            url: 'http://127.0.0.1:0',
          },
      engine: web(),
    },
  ],
} satisfies E2EConfig
