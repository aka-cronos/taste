# Item detail & editor

Each published item can be viewed either in a drawer over the gallery (`/?item=<id>`, masked to `/items/<id>`) or on its standalone page (`/items/<id>`). Signed-in owners can also view inbox items and edit or delete items from the detail view.

## Sub-features

- Masked drawer view from the gallery grid with close action returning to `/`.
- Standalone item page (`/items/<id>`) with title, image/link/note body, description, credit, tags, and Open Graph / Twitter share metadata for published items.
- Not-found state (`Item not found` with `Back to the gallery` link) for unknown IDs or inbox items when signed out.
- Owner editor (`/items/<id>?edit=true` or edit toggle) for updating metadata, tags, status, or deleting an item.

## How to get to it (user POV)

Click any card in the gallery on `/` to open the drawer, or navigate directly to `/items/<id>`.

## Driving it with e2e

- **Preconditions**: Local DB seeded with `pnpm db:seed` (`seed-01` is `Solstice poster`, `seed-10` is an inbox item).
- From `/`, tap `getByRole('link', 'Solstice poster')` → drawer opens with the item's title, description (`Orange disc over warm paper, Swiss poster layout.`), credit (`Studio Example`), and tags (`poster`, `swiss`, `warm`); URL shows `/items/seed-01`.
- Navigate directly to `/items/seed-01` → standalone detail page renders with document title `Solstice poster · Taste`.
- Navigate to `/items/does-not-exist` or `/items/seed-10` while signed out → renders `Item not found` and `Back to the gallery` link.

## Gotchas

- Owner editing, publishing, and deleting require an owner session; use the `owner` session from the test login.
- Inbox items never emit Open Graph or Twitter share tags even when viewed by the owner.
