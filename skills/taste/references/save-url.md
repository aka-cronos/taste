# Save a URL

1. Open the URL and look at it: find the creator, the post or page, and the
   largest image for each visual worth keeping.
2. Call `list_tags` (once per session).
3. Call `save_item` per keeper, following the curation standard. A post with
   several images becomes one image item per image worth keeping; a page
   becomes one link item; a direct image URL becomes an image item with
   `imageUrl`. Pass the owner's own words, if any, as `note`.
4. Report each result: saved with which tags, `duplicate: true` (Taste merged
   your tags into the existing item), or rejected as discarded.

Done when every visual worth keeping at the URL is saved or accounted for in
the report.
