# taste
A personal, self-hostable reference gallery: your taste, curated by you and your agents over MCP.

## Development

Requires Node 22+ and pnpm.

```sh
pnpm install
cp .dev.vars.example .dev.vars   # then fill in the values
pnpm db:migrate:local            # apply D1 migrations to the local database
pnpm dev                         # http://localhost:3000
```

`pnpm dev` runs the app inside the Workers runtime with local D1 (`DB`) and R2
(`BUCKET`) bindings. `GET /api/health` reports whether both are reachable.

Checks: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
After changing `wrangler.jsonc`, run `pnpm cf-typegen` to refresh the binding types.

## Owner sign-in

Only one person, the owner, can sign in, with Google. Any other Google account
is turned away and no user is created for it.

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   create an OAuth client of type **Web application**. Add
   `http://localhost:3000/api/auth/callback/google` and
   `https://<your-domain>/api/auth/callback/google` as authorized redirect URIs.
2. Set the variables listed in `.dev.vars.example`: `OWNER_EMAIL`,
   `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET`. Locally they go in `.dev.vars`; in production, add
   them as secrets with `pnpm exec wrangler secret put <NAME>`.

The auth tables are created in D1 automatically by the Worker on its first
request after a deploy, so there is no migration to run for them.

## Deploy

`pnpm run deploy` builds and deploys the Worker. On the first deploy, Wrangler
creates the production D1 database and R2 bucket declared in `wrangler.jsonc`.
Before deploying your own copy, change the `routes` pattern to your domain and
configure your own Preview resources as described below.

For the owner’s Git connection, preview builds, and branch protection setup, see
[deployment setup](docs/deployment.md). For contributions, see
[CONTRIBUTING.md](CONTRIBUTING.md).
