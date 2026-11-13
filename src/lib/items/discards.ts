import { hostnameOf } from '@/lib/items/model'

/**
 * Something the owner discarded from the inbox. Taste keeps only what
 * identifies the source, so agents do not save it again, and a label to show.
 */
export interface DiscardEntry {
  discardedAt: number
  id: number
  sourceHost: string | null
  sourceUrl: string | null
  title: string | null
}

/** What identifies an item's source: its URL and original image hash. */
export interface SourceKey {
  contentHash: string | null
  sourceUrl: string | null
}

/** Thrown when an agent saves a source the owner discarded before. */
export class DiscardedSourceError extends Error {
  readonly entry: DiscardEntry

  constructor(entry: DiscardEntry) {
    super(
      'The owner discarded this before, so it was not saved. They can allow it again from Discarded in the inbox.',
    )
    this.name = 'DiscardedSourceError'
    this.entry = entry
  }
}

const TITLE_MAX = 200
const ENTRY_SELECT = `SELECT id, title, source_url AS sourceUrl,
  source_host AS sourceHost, discarded_at AS discardedAt FROM discards`
const MATCH =
  '(?1 IS NOT NULL AND source_url = ?1) OR (?2 IS NOT NULL AND content_hash = ?2)'

interface DiscardedItemRow extends SourceKey {
  description: string
  title: string | null
}

function hostOf(url: string | null) {
  if (!url) {
    return null
  }
  try {
    return hostnameOf(url)
  } catch {
    return null
  }
}

/**
 * Statements that record a discard entry for an item about to be deleted.
 * Items with neither a source URL nor an original image hash cannot be
 * saved again by matching, so they get none.
 */
export function recordDiscardStatements(
  db: D1Database,
  rows: DiscardedItemRow[],
  now = Date.now(),
) {
  return rows
    .filter(row => row.sourceUrl || row.contentHash)
    .map(row => {
      const label = (row.title || row.description).trim()
      return db
        .prepare(`INSERT INTO discards (source_url, content_hash, title,
        source_host, discarded_at) VALUES (?, ?, ?, ?, ?)`)
        .bind(
          row.sourceUrl,
          row.contentHash,
          label ? label.slice(0, TITLE_MAX) : null,
          hostOf(row.sourceUrl),
          now,
        )
    })
}

/** The discard entry matching a source URL or image hash, if any. */
export function findDiscard(
  db: D1Database,
  key: SourceKey,
): Promise<DiscardEntry | null> {
  if (!(key.sourceUrl || key.contentHash)) {
    return Promise.resolve(null)
  }
  return db
    .prepare(
      `${ENTRY_SELECT} WHERE ${MATCH} ORDER BY discarded_at DESC LIMIT 1`,
    )
    .bind(key.sourceUrl, key.contentHash)
    .first<DiscardEntry>()
}

/** Removes every discard entry matching a source URL or image hash. */
export function forgetDiscardsStatement(db: D1Database, key: SourceKey) {
  return db
    .prepare(`DELETE FROM discards WHERE ${MATCH}`)
    .bind(key.sourceUrl, key.contentHash)
}

export const DISCARDS_PAGE_SIZE = 200

/** Discard entries, newest first. Owner-only callers. */
export async function listDiscards(
  db: D1Database,
  limit = DISCARDS_PAGE_SIZE,
): Promise<DiscardEntry[]> {
  const { results } = await db
    .prepare(`${ENTRY_SELECT} ORDER BY discarded_at DESC, id DESC LIMIT ?`)
    .bind(limit)
    .all<DiscardEntry>()
  return results
}

/** How many discard entries there are. Owner-only callers. */
export async function countDiscards(db: D1Database): Promise<number> {
  return (
    (await db
      .prepare('SELECT count(*) AS count FROM discards')
      .first<number>('count')) ?? 0
  )
}

/**
 * Forgets a discard entry, so agents can save that source again. Returns
 * whether an entry was removed.
 */
export async function forgetDiscard(db: D1Database, id: number) {
  const result = await db
    .prepare('DELETE FROM discards WHERE id = ?')
    .bind(id)
    .run()
  return (result.meta.changes ?? 0) > 0
}
