# Public gallery

The home page (`/`) shows the owner's published visual references, links, and notes in a filterable grid. Visitors can search, filter by type and tags, switch themes, and open any published item; signed-in owners can also open the add-item drawer.

## Sub-features

- Full-text search (`q` query param) over title, description, note, and tags.
- Type filter (`type` query param): `All types`, `Image`, `Link`, `Note`.
- Multi-tag toggle group (`tags` query param) matching all selected tags (AND).
- Clear filters button when any filter is active.
- Header navigation (`Taste` home link, `Sign in` / owner controls, theme toggle).
- Add-item drawer (`/?add=true`, owner only).

## How to get to it (user POV)

Open `/` directly or click `Taste` in the top header.

## Driving it with e2e

- **Preconditions**: Local DB migrated and seeded with `pnpm db:seed` (provides 9 published items and 2 hidden inbox items).
- Open `/` → grid shows published seed items (for example `getByRole('link', 'Solstice poster')`, `getByText('The return of the grid')`, `getByText('Restraint')`) and never shows `Inbox image` or `Inbox note`.
- Fill `Search` (`#gallery-search`) with `Solstice` and click `Search` → URL updates with `?q=Solstice`, grid narrows to `getByRole('link', 'Solstice poster')`, and `Clear filters` appears.
- Select `Note` in `Type` (`#gallery-type`) → URL updates with `type=note`, only note items render.
- Toggle a tag button (for example `poster`) → URL updates with `tags=...`, only items with every selected tag render.
- Click `Clear filters` → query parameters clear and the full published grid returns.
- Click the theme toggle in the header → document theme class updates without errors.

## Gotchas

- Image cards do not render their title as visible text; match them by accessible link name (`getByRole('link', 'Solstice poster')`), not `getByText`.
- Inbox items (`seed-10`, `seed-11`) must never appear on `/` or in the public tag list.
- Opening an item from the gallery uses a masked URL: browser address bar changes to `/items/<id>` while staying in the gallery drawer (`/?item=<id>`). Reloading navigates to the full `/items/<id>` page.
- `Add` item drawer is only rendered when signed in as the owner; use the `owner` session from the test login.
