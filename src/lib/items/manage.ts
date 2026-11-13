import type { EditItemInput, ItemEditorData } from '@/lib/items/edit-input'
import type { ItemStatus } from '@/lib/items/model'

export async function getItemEditor(
  db: D1Database,
  id: string,
): Promise<ItemEditorData | null> {
  const row = await db
    .prepare(`SELECT id, title, description, note, credit_author AS creditAuthor,
    credit_url AS creditUrl, status FROM items WHERE id = ?`)
    .bind(id)
    .first<
      Omit<
        ItemEditorData,
        'tags' | 'title' | 'note' | 'creditAuthor' | 'creditUrl'
      > & {
        title: string | null
        note: string | null
        creditAuthor: string | null
        creditUrl: string | null
      }
    >()
  if (!row) {
    return null
  }
  const { results } = await db
    .prepare(`SELECT t.normalized_name AS name FROM tags t
    JOIN item_tags it ON it.tag_id = t.id WHERE it.item_id = ? ORDER BY t.normalized_name`)
    .bind(id)
    .all<{ name: string }>()
  return {
    ...row,
    creditAuthor: row.creditAuthor ?? '',
    creditUrl: row.creditUrl ?? '',
    note: row.note ?? '',
    tags: results.map(tag => tag.name),
    title: row.title ?? '',
  }
}

export async function updateItem(db: D1Database, input: EditItemInput) {
  const statements = [
    db
      .prepare(`UPDATE items SET title = ?, description = ?, note = ?,
    credit_author = ?, credit_url = ?, updated_at = ? WHERE id = ?`)
      .bind(
        input.title || null,
        input.description,
        input.note || null,
        input.creditAuthor || null,
        input.creditUrl || null,
        Date.now(),
        input.id,
      ),
    db.prepare('DELETE FROM item_tags WHERE item_id = ?').bind(input.id),
  ]
  for (const tag of input.tags) {
    statements.push(
      db
        .prepare(
          'INSERT INTO tags (name, normalized_name) SELECT ?, ? WHERE EXISTS (SELECT 1 FROM items WHERE id = ?) ON CONFLICT DO NOTHING',
        )
        .bind(tag, tag, input.id),
      db
        .prepare(
          'INSERT INTO item_tags (item_id, tag_id) SELECT ?, id FROM tags WHERE normalized_name = ? AND EXISTS (SELECT 1 FROM items WHERE id = ?)',
        )
        .bind(input.id, tag, input.id),
    )
  }
  await db.batch(statements)
}

export async function setItemVisibility(
  db: D1Database,
  id: string,
  status: ItemStatus,
) {
  await db
    .prepare(`UPDATE items SET status = ?, updated_at = ?,
    published_at = CASE WHEN ? = 'published' THEN coalesce(published_at, ?) ELSE published_at END WHERE id = ?`)
    .bind(status, Date.now(), status, Date.now(), id)
    .run()
}

export async function deleteItem(
  { db, bucket }: { db: D1Database; bucket: Pick<R2Bucket, 'delete'> },
  id: string,
) {
  const row = await db
    .prepare('SELECT image_key FROM items WHERE id = ?')
    .bind(id)
    .first<{ image_key: string | null }>()
  if (!row) {
    return
  }
  // Keep the row and its key if R2 fails, so deletion can be retried.
  if (row.image_key) {
    await bucket.delete(row.image_key)
  }
  await db.prepare('DELETE FROM items WHERE id = ?').bind(id).run()
}

export async function listOwnerTags(db: D1Database) {
  const { results } = await db
    .prepare(
      'SELECT normalized_name AS name FROM tags ORDER BY normalized_name',
    )
    .all<{ name: string }>()
  return results.map(tag => tag.name)
}

// D1 caps a statement at 100 bound parameters, so a selection of ids is
// bound as one JSON array and expanded with json_each.
const IN_IDS = 'IN (SELECT value FROM json_each(?))'

/**
 * Publishes the given inbox items. Ids that are missing or already published
 * are skipped. Returns how many items were published.
 */
export async function publishInboxItems(db: D1Database, ids: string[]) {
  if (ids.length === 0) {
    return 0
  }
  const now = Date.now()
  const result = await db
    .prepare(`UPDATE items SET status = 'published', updated_at = ?,
    published_at = coalesce(published_at, ?)
    WHERE status = 'inbox' AND id ${IN_IDS}`)
    .bind(now, now, JSON.stringify(ids))
    .run()
  return result.meta.changes ?? 0
}

/**
 * Permanently deletes the given inbox items, their tag links, FTS rows and
 * stored images. Ids that are missing or published are skipped. Returns how
 * many items were discarded.
 */
export async function discardInboxItems(
  { db, bucket }: { db: D1Database; bucket: Pick<R2Bucket, 'delete'> },
  ids: string[],
) {
  if (ids.length === 0) {
    return 0
  }
  const { results } = await db
    .prepare(`SELECT id, image_key AS imageKey FROM items
    WHERE status = 'inbox' AND id ${IN_IDS}`)
    .bind(JSON.stringify(ids))
    .all<{ id: string; imageKey: string | null }>()
  if (results.length === 0) {
    return 0
  }
  const keys = results.flatMap(row => (row.imageKey ? [row.imageKey] : []))
  // Keep the rows and their keys if R2 fails, so discarding can be retried.
  if (keys.length > 0) {
    await bucket.delete(keys)
  }
  const found = results.map(row => row.id)
  await db
    .prepare(`DELETE FROM items WHERE id ${IN_IDS}`)
    .bind(JSON.stringify(found))
    .run()
  return found.length
}
