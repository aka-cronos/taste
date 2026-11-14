# Review likes

Turn a pile of liked posts into curated inbox items.

1. **Get the likes.** Use what the owner points you at: pasted links, an
   export file (for X, `data/like.js` in the account archive), a bookmarks
   file, or a browser or connector tool you have. Ask for one if none is
   available. Default to the 50 most recent.
2. Call `list_tags` to learn the vocabulary.
3. **Triage** each like: keep visual references (art, design, photography,
   typography, architecture, interfaces, objects, spaces); skip news, jokes,
   text-only threads and posts with no reachable media. When unsure whether
   it is already saved, check with `search_items`.
4. **Save** each keeper with `save_item` following the curation standard.
   Batch saves without stopping to ask per item.
5. **Report** the tally: reviewed, saved, duplicates, off-taste skips,
   unreachable, and any new tags you introduced.

Done when every like in the batch lands in exactly one tally bucket.
