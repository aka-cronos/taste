---
name: verify-taste
description: Verify a change in Taste's real web app and MCP server: launch, doctor, drive with e2e, capture evidence, and clean up.
---

# Verify Taste

Project-specific facts for verifying Taste. Follow the verify playbook for the procedure, statuses, rounds, and report format; use this skill for how to run, check, drive, and clean up Taste itself.

## Surface

- **Primary**: Web app (TanStack Start on Cloudflare Workers) — public gallery (`/`), item pages (`/items/$id`), owner inbox (`/inbox`, `/inbox/discarded`), and MCP OAuth consent (`/mcp/authorize`).
- **Secondary**: Private MCP server (`/mcp`) with OAuth 2.1 discovery (`/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`) and health endpoint (`/api/health`).
- **Isolation**: Each worktree has its own local D1 database and R2 bucket under `.wrangler/state/` and can run on its own port (`3000`–`3009`). Local auth follows the request's loopback origin, so cookie POSTs and MCP consent work on `127.0.0.1:<port>`; Google sign-in itself only completes on `http://localhost:3000`–`3009`.

## Launch

From a worktree root with an empty or existing local database:

```sh
pnpm install --frozen-lockfile
cp .dev.vars.example .dev.vars   # or `envsync` when configured
pnpm db:migrate:local
pnpm db:seed                     # optional: 9 published + 2 inbox items with SVG images
```

Start the dev server on a free port (pick an unused port between `3000` and `3009`; check with `lsof -iTCP:<port> -sTCP:LISTEN`) and record its PID:

```sh
mkdir -p .e2e/logs
E2E_TELEMETRY_DISABLED=1 WRANGLER_SEND_METRICS=false \
  pnpm exec vite dev --host 127.0.0.1 --port <port> --strictPort \
  > .e2e/logs/app.log 2>&1 &
echo $! > .e2e/app.pid
```

**Readiness**: the app is usable when both hold:

1. `curl -sf http://127.0.0.1:<port>/api/health` returns `{"d1":true,"ok":true,"r2":true}`.
2. `curl -sf http://127.0.0.1:<port>/` returns HTTP 200 with HTML containing `Taste`.

**Reusing the running app with `e2e`**:

```sh
E2E_TELEMETRY_DISABLED=1 APP_URL=http://127.0.0.1:<port> pnpm test:e2e
```

Without `APP_URL`, `e2e.config.ts` starts its own `vite dev` instance on a random free port (`http://127.0.0.1:0`) against this worktree's `.wrangler/state/`.

## Doctor

Run the read-only doctor script before driving and again after any unexpected failure:

```sh
.agents/skills/verify-taste/scripts/doctor.sh <port> [expected-commit-sha]
```

It checks that the recorded PID is alive (when `.e2e/app.pid` exists), `HEAD` matches the expected commit (when given), `/api/health` reports `d1: true`, `r2: true`, `ok: true`, and `/` responds with HTTP 200.

**Test login status (pending #93)**: Taste does not yet have a non-production test login. Criteria that require an authenticated owner session cannot be driven automatically yet and end the round as `pending` (`waiting on owner: non-production test login (#93)`).

## Drive

- Walk the running app through `e2e mcp` pointed at `http://127.0.0.1:<port>`.
- **Test login**: pending #93. Once #93 lands, add the `test.setup` file path, restored session name, and env var name here.
- **Synthetic data**: `pnpm db:seed` inserts deterministic items `seed-01` through `seed-09` (published) and `seed-10` through `seed-11` (inbox, hidden from public routes), plus generated SVG images in local R2. Rerunning `pnpm db:seed` replaces `seed-*` rows and leaves other rows intact.
- **MCP server**: endpoint is `http://127.0.0.1:<port>/mcp`. Unauthenticated requests return `401` with a `WWW-Authenticate` header pointing to `/.well-known/oauth-protected-resource`. Authenticated MCP tool calls (`search_items`, `get_item`, `list_tags`, `save_item`, `update_item`) require an OAuth access token obtained from an owner session (pending #93).
- **Feature map**: see [features/README.md](features/README.md) for routes, user journeys, and gotchas.

## Evidence

- Save screenshots and recordings to `.evidence/<issue>/` (gitignored; attached to PR comments via `--attach`).
- Prove each criterion with the observable end state on screen. For writes, reload the page or read the stored value back to prove persistence.
- Record one video of the walk whenever the PR touches `uiFiles` in `.agents/process.json`.

## Production

Production URL is in `.agents/process.json` (`https://taste.akacronos.com`); there is no staging environment. Production walks are strictly read-only and signed out:

- `GET /api/health` returns `{"d1":true,"ok":true,"r2":true}`.
- `/` renders the public gallery, search input, type filter, tag toggles, theme toggle, and item drawer.
- `/items/<id>` renders a published item with its metadata and share tags; unknown IDs render `Item not found`.
- `/inbox` and `/inbox/discarded` render `Page not found` when signed out.
- `POST /mcp` without a bearer token returns `401` with `WWW-Authenticate`.

## Cleanup

Stop only the process this run started, using the PID recorded in `.e2e/app.pid` (never kill by process name):

```sh
if [ -f .e2e/app.pid ]; then
  kill "$(cat .e2e/app.pid)" 2>/dev/null || true
  rm -f .e2e/app.pid
fi
```

Leave `.evidence/<issue>/` intact until the PR merges or closes.
