-- Covers do not identify the linked page. Keep hashes for original images only.
UPDATE items SET content_hash = NULL WHERE type <> 'image';
