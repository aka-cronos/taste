-- Items, their tags, and the full-text index over both.

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('image', 'link', 'note')),
  title TEXT,
  description TEXT NOT NULL DEFAULT '',
  note TEXT,
  source_url TEXT,
  credit_author TEXT,
  credit_url TEXT,
  origin TEXT NOT NULL CHECK (origin IN ('manual', 'agent')),
  status TEXT NOT NULL CHECK (status IN ('inbox', 'published')),
  -- SHA-256 of the stored image bytes, for deduplication.
  content_hash TEXT,
  -- R2 key of the stored image: the image itself for `image` items, the cover
  -- for `link` items. Notes have none.
  image_key TEXT,
  image_width INTEGER,
  image_height INTEGER,
  -- Unix epoch milliseconds.
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER,
  CHECK (status = 'inbox' OR published_at IS NOT NULL),
  CHECK (type <> 'image' OR image_key IS NOT NULL)
);

CREATE INDEX items_status_published ON items (status, published_at DESC, id DESC);
CREATE INDEX items_source_url ON items (source_url) WHERE source_url IS NOT NULL;
CREATE UNIQUE INDEX items_content_hash ON items (content_hash) WHERE content_hash IS NOT NULL;
CREATE UNIQUE INDEX items_image_key ON items (image_key) WHERE image_key IS NOT NULL;

CREATE TABLE tags (
  id INTEGER PRIMARY KEY,
  -- As first written, for display.
  name TEXT NOT NULL,
  -- Trimmed, lowercased, whitespace collapsed (see normalizeTagName).
  normalized_name TEXT NOT NULL UNIQUE
);

CREATE TABLE item_tags (
  item_id TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, tag_id)
) WITHOUT ROWID;

CREATE INDEX item_tags_tag ON item_tags (tag_id, item_id);

-- Full-text index. Rows are keyed by item_id rather than rowid, because the
-- rowid of a table with a TEXT primary key is not stable across VACUUM.
CREATE VIRTUAL TABLE items_fts USING fts5 (
  item_id UNINDEXED,
  title,
  description,
  note,
  tags,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER items_fts_insert AFTER INSERT ON items BEGIN
  INSERT INTO items_fts (item_id, title, description, note, tags)
  VALUES (new.id, new.title, new.description, new.note, '');
END;

CREATE TRIGGER items_fts_update AFTER UPDATE OF title, description, note ON items BEGIN
  UPDATE items_fts
  SET title = new.title, description = new.description, note = new.note
  WHERE item_id = new.id;
END;

CREATE TRIGGER items_fts_delete AFTER DELETE ON items BEGIN
  DELETE FROM items_fts WHERE item_id = old.id;
END;

CREATE TRIGGER item_tags_fts_insert AFTER INSERT ON item_tags BEGIN
  UPDATE items_fts
  SET tags = (
    SELECT coalesce(group_concat(t.name, ' '), '')
    FROM item_tags it JOIN tags t ON t.id = it.tag_id
    WHERE it.item_id = new.item_id
  )
  WHERE item_id = new.item_id;
END;

CREATE TRIGGER item_tags_fts_delete AFTER DELETE ON item_tags BEGIN
  UPDATE items_fts
  SET tags = (
    SELECT coalesce(group_concat(t.name, ' '), '')
    FROM item_tags it JOIN tags t ON t.id = it.tag_id
    WHERE it.item_id = old.item_id
  )
  WHERE item_id = old.item_id;
END;

CREATE TRIGGER tags_fts_rename AFTER UPDATE OF name ON tags BEGIN
  UPDATE items_fts
  SET tags = (
    SELECT coalesce(group_concat(t.name, ' '), '')
    FROM item_tags it JOIN tags t ON t.id = it.tag_id
    WHERE it.item_id = items_fts.item_id
  )
  WHERE item_id IN (SELECT item_id FROM item_tags WHERE tag_id = new.id);
END;
