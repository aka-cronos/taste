-- What the owner discarded from the inbox, so agents do not save it again.
-- Only what identifies the source and labels it is kept; the item, its tags
-- and its stored image are deleted.

CREATE TABLE discards (
  id INTEGER PRIMARY KEY,
  source_url TEXT,
  -- SHA-256 of the original image bytes, like items.content_hash.
  content_hash TEXT,
  -- For display only.
  title TEXT,
  source_host TEXT,
  -- Unix epoch milliseconds.
  discarded_at INTEGER NOT NULL,
  CHECK (source_url IS NOT NULL OR content_hash IS NOT NULL)
);

CREATE INDEX discards_source_url ON discards (source_url) WHERE source_url IS NOT NULL;
CREATE INDEX discards_content_hash ON discards (content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX discards_discarded_at ON discards (discarded_at DESC, id DESC);
