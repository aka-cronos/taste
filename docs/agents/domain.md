# Domain

- **Owner**: the one person who can sign in to an install, identified by the
  Google account in `OWNER_EMAIL`. Visitors browse without signing in.
- **Item**: one reference in the gallery. Its type is `image` (a copy stored
  in R2), `link` (a page, with an optional cover image) or `note` (free text).
- **Published** / **inbox**: an item's status. Published items are public.
  Inbox items were saved by an agent and only the owner sees them until they
  are published.
- **Tag**: a free, flat label on items. Tags are unique by normalized name
  (trimmed, lowercased, whitespace collapsed), so `Brutalism` and
  `brutalism` are one tag.
- **Credit**: who made an item and where the original lives: the credit
  author and URL, falling back to the source URL's hostname.
- **Discard** / **delete**: two ways to remove an item. Discarding (inbox
  only) means "not for my taste": the item and its image are deleted, and a
  **discard entry** keeps its source URL and original image hash, so agents
  cannot save it again. Deleting just removes the item and leaves no entry.
  Adding a discarded source by hand saves it and removes the entry; the owner
  can also **forget** an entry from the Discarded view.
