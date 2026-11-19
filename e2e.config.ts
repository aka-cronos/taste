import { web } from '@e2e-dev/web'
import type { E2EConfig } from 'e2e'

// Point APP_URL at a running app to reuse it; otherwise the runner starts
// the dev server on a free port, so worktrees and CI never collide.
const appUrl = process.env.APP_URL

export default {
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
