# Re-tag

Taste tags are flat and normalised (trimmed, lowercased), so `Brutalism` and
`brutalism` are already one tag. Drift shows up as synonyms, plurals and
near-duplicates: `poster` / `posters`, `typography` / `type`.

1. Call `list_tags` and group drifting tags into a **merge map**: each group's
   keeper (usually the most used) and the tags folding into it.
2. Show the owner the merge map, plus any thin descriptions you plan to
   enrich, and wait for approval. Apply only what they approve.
3. For each tag folding away, `search_items` with that tag (follow
   `nextCursor` to the end). For every item, call `update_item` with the full
   new tag list: its current tags with the old tag swapped for the keeper.
   `tags` replaces the whole list, so always send the complete set.
4. Enriching descriptions: `get_item`, look at the image or source, and send
   a new `description` that meets the curation standard.
5. Re-run `list_tags` and report the before and after counts.

Done when `list_tags` shows no tag from the approved merge map except the
keepers.
