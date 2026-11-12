import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'

const MIGRATIONS_DIR = join(import.meta.dirname, '../../migrations')

type Row = Record<string, unknown>

class Statement {
  readonly db: DatabaseSync
  readonly sql: string
  readonly params: SQLInputValue[]

  constructor(db: DatabaseSync, sql: string, params: SQLInputValue[] = []) {
    this.db = db
    this.sql = sql
    this.params = params
  }

  bind(...params: unknown[]) {
    return new Statement(this.db, this.sql, params as SQLInputValue[])
  }

  all<T = Row>() {
    const results = this.db.prepare(this.sql).all(...this.params) as T[]
    return Promise.resolve({ meta: {}, results, success: true })
  }

  first<T = Row>(column?: string) {
    const row = this.db.prepare(this.sql).get(...this.params) as Row | undefined
    if (!row) {
      return Promise.resolve(null)
    }
    return Promise.resolve((column ? row[column] : row) as T)
  }

  run() {
    const result = this.db.prepare(this.sql).run(...this.params)
    return Promise.resolve({ meta: result, results: [], success: true })
  }
}

/**
 * An in-memory SQLite database with this repo's migrations applied, behind
 * the subset of the D1 API the app uses. D1 runs SQLite with foreign keys on,
 * and so does this.
 */
export function createTestD1() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  for (const file of readdirSync(MIGRATIONS_DIR).sort()) {
    if (file.endsWith('.sql')) {
      sqlite.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
    }
  }
  const db = {
    // node:sqlite is synchronous, so the statements still run in order.
    batch: (statements: Statement[]) =>
      Promise.all(statements.map(statement => statement.all())),
    exec: (sql: string) => {
      sqlite.exec(sql)
      return Promise.resolve({ count: 0, duration: 0 })
    },
    prepare: (sql: string) => new Statement(sqlite, sql),
  }
  return { db: db as unknown as D1Database, sqlite }
}
