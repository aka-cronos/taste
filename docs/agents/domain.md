# Domain

- **Owner**: the one person who can sign in to an install, identified by the
  Google account in `OWNER_EMAIL`. Visitors browse without signing in.
- **Item**: one reference in the gallery. Its type is `image` (a copy stored
  in R2), `link` (a page, with an optional cover image) or `note` (free text).
- **Published** / **inbox**: an item's status. Published items are public.
  Inbox items were saved by an agent and only the owner sees them until they
  are published. Who saves an item decides its status: the owner's items are
  published at once, an agent's always land in the inbox.
- **Tag**: a free, flat label on items. A tag is its normalized name
  (trimmed, lowercased, whitespace collapsed), so `Brutalism` and
  `brutalism` are one tag, stored and returned as `brutalism`. A tag exists
  only while at least one item uses it. Visitors see only the tags of
  published items; the owner sees every tag in use.
- **Credit**: who made an item and where the original lives: the credit
  author and URL, falling back to the source URL's hostname.
- **Discard** / **delete**: two ways to remove an item. Discarding (inbox
  only) means "not for my taste": the item and its image are deleted, and a
  **discard entry** keeps its source URL and original image hash, so agents
  cannot save it again. Deleting just removes the item and leaves no entry.
  Adding a discarded source by hand saves it and removes the entry; the owner
  can also **forget** an entry from the Discarded view. An item and a
  discard entry never share a source.
- **Source**: what identifies where an item came from: its source URL (for
  an image saved without one, the image's own URL) and, for images, the hash
  of the original image. No two items share a source;
  saving one again returns the existing item with the new tags merged in.
