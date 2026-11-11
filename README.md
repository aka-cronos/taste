# taste
A personal, self-hostable reference gallery: your taste, curated by you and your agents over MCP.

## Development

Requires Node 22+ and pnpm.

```sh
pnpm install
cp .dev.vars.example .dev.vars   # local variables, if any
pnpm db:migrate:local            # apply D1 migrations to the local database
pnpm dev                         # http://localhost:3000
```

`pnpm dev` runs the app inside the Workers runtime with local D1 (`DB`) and R2
(`BUCKET`) bindings. `GET /api/health` reports whether both are reachable.

Checks: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
After changing `wrangler.jsonc`, run `pnpm cf-typegen` to refresh the binding types.

## Deploy

`pnpm run deploy` builds and deploys the Worker. On the first deploy, Wrangler
creates the D1 database and R2 bucket declared in `wrangler.jsonc`, so no
resource IDs live in the repo. Change the `routes` pattern to your own domain
before deploying your own copy.

For the owner’s Git connection, preview builds, and branch protection setup, see
[deployment setup](docs/deployment.md). For contributions, see
[CONTRIBUTING.md](CONTRIBUTING.md).
