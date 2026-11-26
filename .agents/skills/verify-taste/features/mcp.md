# MCP server & OAuth

Taste exposes a private stateless MCP server at `/mcp` protected by OAuth 2.1 with PKCE and dynamic client registration. Authorized clients can search references, inspect items, list tags, save new references to the inbox, and enrich metadata.

## Sub-features

- OAuth 2.1 metadata discovery (`/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`).
- Consent page (`/mcp/authorize`) showing requested client and read/write permissions.
- Read tools (`mcp:read`): `search_items`, `get_item`, `list_tags`.
- Write tools (`mcp:write`): `save_item` (always saves to `inbox`), `update_item` (edits metadata only; cannot publish or delete).

## How to get to it (user POV)

An MCP client connects to `<origin>/mcp`, discovers OAuth endpoints, registers dynamically, and sends the owner to `/mcp/authorize` to approve access.

## Driving it with e2e

- **Preconditions**: Running dev server on `http://127.0.0.1:<port>` with local DB migrated.
- `POST /mcp` without an `Authorization` header → returns HTTP `401` with `WWW-Authenticate` header pointing to `/.well-known/oauth-protected-resource`.
- `GET /.well-known/oauth-protected-resource` → returns HTTP `200` JSON advertising the `/mcp` resource and authorization server.
- Open `/mcp/authorize` while signed out → renders `Connect to Taste`, `Sign in as owner`, and `Cancel` buttons.
- With the `owner` session, `mcpAccessToken` in `tests/support/mcp.ts` registers a client, opens `/api/auth/oauth2/authorize` with PKCE, approves on `/mcp/authorize`, captures the code from the redirect and exchanges it; `callTool` then calls `/mcp` with the bearer token. `tests/mcp.e2e.ts` saves a note with `save_item` and finds it in `/inbox`.

## Gotchas

- The consent button stays disabled until the page hydrates; a click before that would drop the authorization request.
- Each `save_item` run adds a row to the local inbox; `pnpm db:seed` leaves non-seed rows in place.
- `/mcp` calls `ensureAuthSchema()` on first request; the auth tables are created automatically in local D1 without a separate migration.
