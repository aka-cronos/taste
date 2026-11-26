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
- **Sign-in**: when `BETTER_AUTH_URL` is `http://localhost:<port>` or `http://127.0.0.1:<port>`, auth follows the origin the request arrives on, so cookie POSTs, MCP discovery and MCP consent work on any port. Google sign-in completes only where Google's client has the redirect URI registered (`http://localhost:3000`–`3009`); elsewhere, including `127.0.0.1`, it stops at `redirect_uri_mismatch`.
- **Cookies**: browsers share cookies across ports of one host, so signing in on `localhost:3001` replaces the session cookie of `localhost:3000`. Use a separate browser profile per worktree to stay signed in on both.
- **Tests**: `pnpm test` runs against an in-memory SQLite database and needs no dev server.
- **e2e flows**: `pnpm test:e2e` starts its own dev server on a free port against this worktree's database; `APP_URL=http://localhost:<port> pnpm test:e2e` reuses a running one. The first run needs a browser: `pnpm exec e2e-web install chromium`. Keep telemetry off with `pnpm exec e2e telemetry disable` once per machine.
