# Inbox & discarded

Private curation queues for the owner. Agents save references into the inbox (`/inbox`), where the owner reviews, edits, publishes to the public gallery, or discards them. Discarded sources are tracked on `/inbox/discarded` so agents skip them in the future.

## Sub-features

- Inbox queue (`/inbox`) showing pending items saved by agents, with count badge in the header.
- Item review actions: publish, edit, or discard.
- Discarded list (`/inbox/discarded`) showing previously rejected sources.
- Signed-out protection: both routes render `Page not found` when accessed without an owner session.

## How to get to it (user POV)

Sign in as the owner and click `Inbox` in the top header, then navigate to discarded items from the inbox view.

## Driving it with e2e

- **Preconditions**: Local DB seeded with `pnpm db:seed` (`seed-10` and `seed-11` are inbox items).
- Signed out: navigate to `/inbox` and `/inbox/discarded` → both render `Page not found` with a `Back to the gallery` link, and neither exposes inbox item titles or descriptions.
- Signed in as owner: open `/inbox` → shows `Inbox image` and `Inbox note` (blocked on #93 until non-production test login exists).

## Gotchas

- Authenticated inbox and discarded flows cannot run automatically until the non-production test login (#93) lands. Report criteria requiring an owner session as `pending` (`waiting on owner: non-production test login (#93)`).
- Local Google OAuth sign-in completes only on `http://localhost:3000`–`3009`, the redirect URIs registered with Google; on `127.0.0.1` it stops at `redirect_uri_mismatch`.
