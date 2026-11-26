# Taste feature map

User-facing features and their routes. Search `tests/` (the `e2eDir` in `.agents/process.json`) to find existing e2e flows covering a route.

| Feature | Routes / endpoints | Auth | File |
| --- | --- | --- | --- |
| Public gallery | `/` | Public (owner adds items) | [gallery.md](gallery.md) |
| Item detail & editor | `/?item=<id>`, `/items/$id` | Public read; owner edits | [item-detail.md](item-detail.md) |
| Inbox & discarded | `/inbox`, `/inbox/discarded` | Owner only | [inbox.md](inbox.md) |
| MCP server & OAuth | `/mcp`, `/mcp/authorize`, `/.well-known/*` | OAuth bearer token (owner) | [mcp.md](mcp.md) |
