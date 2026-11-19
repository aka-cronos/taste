# Environments

The app is one Cloudflare Worker (`taste`) with a D1 database (`DB`) and an R2 bucket (`BUCKET`). Setup of the Git connection, Previews and the ruleset is in [docs/deployment.md](../deployment.md).

| Environment | URL | Data | Deploys |
| --- | --- | --- | --- |
| Local | `http://localhost:<port>` | Each worktree's own D1 and R2 in `.wrangler/state/` | `pnpm dev`; see `worktree.md` |
| Preview | Posted by Cloudflare on each PR | Shared `taste-preview` D1 and `taste-images-preview` R2; synthetic data only | Automatically on every push to a PR branch |
| Production | `https://taste.akacronos.com` | `taste` D1 and `taste-images` R2 | Manually, by the owner |

There is no staging. The check after a merge runs in production, after the owner's go.

## Production deploy

Merging to `main` builds the Worker in Cloudflare Workers Builds and uploads a new version (`wrangler versions upload`) without serving it. The owner makes it live:

1. If the change adds a file under `migrations/`, apply it first: `pnpm db:migrate:remote`. Migrations are forward-only and must keep the running version working, since it serves traffic until step 2. The auth tables need no migration; the Worker creates them on its first request.
2. Deploy the version: Cloudflare dashboard → Workers & Pages → `taste` → Deployments → the new version → Deploy, or `pnpm exec wrangler versions deploy <version-id>@100% -y`.
3. Check `https://taste.akacronos.com/api/health` answers `{"d1":true,"ok":true,"r2":true}`, then the flows the change touched.

Agents never deploy to production; they prepare the release summary and the owner runs these steps.

## Rollback

Serve the previous version again: dashboard → Deployments → the previous version → Rollback, or `pnpm exec wrangler rollback <version-id>`. A rollback changes code only: it does not undo migrations or data changes, so a migration that the previous version cannot read needs a new forward migration instead.

## Tokens

- **GitHub Actions** holds no Cloudflare token; CI only verifies.
- **Workers Builds** deploys with Cloudflare's own build token, managed in the dashboard.
- **Agents** hold no token that can deploy or change production resources. A machine where agents run does not keep a `wrangler login` session, which grants the whole account.
- **Previews** use their own secrets (see `deployment.md`), never production's.

## Error signal

Production errors and logs go to Workers Logs (`observability` is enabled in `wrangler.jsonc`): dashboard → Workers & Pages → `taste` → Logs, filtered by level `error`. `wrangler tail taste --format json` streams live requests. An agent reads them only with a read-only logs token from the owner; without one, it asks the owner for the relevant log lines.
