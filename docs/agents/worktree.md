# Worktree prep

One issue runs in one worktree, on its own branch from fresh `main`. These commands take a new worktree to a running app, from its root:

```sh
pnpm install --frozen-lockfile
envsync                       # renders .dev.vars from .dev.vars.tpl
pnpm db:migrate:local         # creates this worktree's own D1 database
pnpm db:seed                  # optional: sample items and images
pnpm dev --port <port>        # a free port between 3000 and 3009
```

Without `envsync` (no access to the maintainer's vault), copy `.dev.vars.example` to `.dev.vars` and fill in the values instead.

`GET /api/health` on the chosen port answers `{"d1":true,"ok":true,"r2":true}` when the app and its bindings are up.

## Isolation

- **Database and images**: the local D1 database and R2 bucket live in `.wrangler/state/` inside the worktree, so every worktree has its own. Nothing is shared with other worktrees, Previews or production.
- **Port**: pick a port no other worktree uses; `lsof -iTCP:<port> -sTCP:LISTEN` shows whether one is taken.
- **Tests**: `pnpm test` runs against an in-memory SQLite database and needs no dev server.
- **e2e flows**: `pnpm test:e2e` starts its own dev server on a free port against this worktree's database; `APP_URL=http://localhost:<port> pnpm test:e2e` reuses a running one. The first run needs a browser: `pnpm exec e2e-web install chromium`. Keep telemetry off with `pnpm exec e2e telemetry disable` once per machine.

## Known limit: owner sign-in

Local sign-in sends Google back to `BETTER_AUTH_URL` from `.dev.vars` (`http://localhost:3000`), whatever port the worktree runs on. Until that changes, only a worktree on port 3000 can sign in as the owner; on any other port, flows that need the owner (inbox, editing, MCP consent) cannot be verified in the browser.
