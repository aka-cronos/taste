# taste
A personal, self-hostable reference gallery: your taste, curated by you and your agents over MCP.

## Development

Requires Node 22+ and pnpm.

```sh
pnpm install
cp .dev.vars.example .dev.vars   # then fill in the values
pnpm db:migrate:local            # apply D1 migrations to the local database
pnpm db:seed                     # optional: sample items and images
pnpm dev                         # http://localhost:3000
```

`pnpm db:seed` fills the local database and bucket with sample items of every
type, including two inbox items that must never show on the public page. It is
safe to rerun and never touches remote resources.

The maintainer renders `.dev.vars` from `.dev.vars.tpl` with 1Password
(`envsync`); everyone else copies `.dev.vars.example` as shown.

`pnpm dev` runs the app inside the Workers runtime with local D1 (`DB`) and R2
(`BUCKET`) bindings. `GET /api/health` reports whether both are reachable.
Stored images are served from R2 at `/media/<key>`: images of published items
are public, images of inbox items are visible to the owner only. Media responses
are not cached, so hiding or deleting an item takes effect on subsequent requests.

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

## Item curation and takedown contact

Sign in and open an item to edit its title, description, note, tags and credit
in place. Tag suggestions include existing inbox tags and are owner-only.
Move an item to the inbox to hide it; its detail URL stays accessible to the
owner, who can publish it again. Deleting an item requires confirmation and
permanently removes its stored image or link cover, tag links and search entry.

Set `CONTACT_URL` in `wrangler.jsonc` (`vars`) to an `https://` contact page or a
`mailto:` address to show a “Request removal” link in the site footer. Leave it
empty to omit the link. Locally, it can be overridden in `.dev.vars`.

## MCP writes

Connect an MCP client to `/mcp` and complete owner OAuth consent. The initial
authentication challenge requests `mcp:read mcp:write`, and client registration
defaults to `mcp:read mcp:write offline_access`. The owner must explicitly
approve read and write access before a token can save or edit references.
Clients can still request only `mcp:read` for read-only access. Existing tokens
keep their original permissions; reconnect existing clients to request both
scopes. If a client reuses a saved read-only scope, recreate its connection or
configure it to request `mcp:read mcp:write` explicitly.

- `save_item` requires `type` (`image`, `link`, or `note`) and a non-empty
  `description`. For a post, pass `sourceUrl` with `type: "link"`. For an image,
  pass either `imageUrl` or raw `imageBase64` plus `imageContentType` (PNG, JPEG,
  GIF, or WebP, up to 10 MB). For a note, pass `note`; cite sources with
  `creditUrl`. Notes reject `sourceUrl` so they cannot collide with saved links
  or images.
- Optional metadata: `title`, `tags`, `creditAuthor`, `creditUrl`, and `note`.
  New items always enter the inbox with agent origin. Duplicates return
  `duplicate: true` and the existing item, merging tags while preserving its
  metadata and visibility. Discarded sources are rejected.
- `update_item` takes `id` and any of `title`, `description`, `note`, `tags`,
  `creditAuthor`, or `creditUrl`. Only supplied fields change; `tags` replaces
  the tag list. Empty strings clear optional text and credit fields.

Neither write tool can change visibility, origin, or source, publish an item,
or delete one. Read-only tokens cannot discover or call write tools.
