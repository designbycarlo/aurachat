/* Database connection + schema bootstrap for AuraChat.
 *
 * Production (Railway): uses `pg` against the DATABASE_URL that Railway's
 * managed Postgres add-on injects automatically. This survives redeploys and
 * works across multiple instances because the data lives in the managed
 * database, not on the ephemeral container filesystem.
 *
 * Local dev / tests: if DATABASE_URL is unset, falls back to pglite — a real
 * Postgres engine compiled to WASM that runs embedded with zero setup. It
 * speaks genuine Postgres SQL, so the schema and queries are exercised
 * against true Postgres semantics, not a mock.
 *
 * Both backends are hidden behind a single async `query()` interface so the
 * rest of the app never branches on which one is active.
 */

const fs = require('fs');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  salt        TEXT NOT NULL,
  pass_hash   TEXT NOT NULL,
  created_at  BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,
  url        TEXT NOT NULL DEFAULT '',
  title      TEXT NOT NULL DEFAULT '',
  score      INTEGER NOT NULL DEFAULT 0,
  grade      TEXT NOT NULL DEFAULT '--',
  report     JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS reset_tokens (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_user ON reports(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_reset_user ON reset_tokens(user_id);
`;

let mode = 'pending';
let pool = null; // pg.Pool (production)
let pglite = null; // PGlite instance (local/dev)

function connect() {
  if (mode !== 'pending') return;
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: url, max: 10 });
    pool.on('error', (err) => console.error('Unexpected Postgres pool error:', err));
    mode = 'pg';
    console.log('[db] Using managed Postgres (DATABASE_URL)');
  } else {
    const { PGlite } = require('@electric-sql/pglite');
    // Persist to a local data dir so dev sessions survive restarts.
    const dir = path.join(__dirname, 'data-pglite');
    pglite = new PGlite(dir);
    mode = 'pglite';
    console.log('[db] Using embedded PGlite (no DATABASE_URL set)');
  }
}

async function query(text, params = []) {
  connect();
  if (mode === 'pg') {
    const client = await pool.connect();
    try {
      const res = await client.query(text, params);
      return res;
    } finally {
      client.release();
    }
  }
  // pglite: returns { rows, fields, affectedRows } (note: no rowCount).
  // Normalize to a pg-compatible shape ({ rows, fields, rowCount }) so callers
  // never branch on backend.
  const res = await pglite.query(text, params);
  return {
    rows: res.rows,
    fields: res.fields,
    rowCount: res.rowCount != null ? res.rowCount : (res.affectedRows != null ? res.affectedRows : 0),
  };
}

async function initDb() {
  connect();
  // Run idempotent schema DDL.
  // pg can take multiple statements in one query; pglite handles one or many
  // too. Split on semicolons to be safe on both engines.
  const statements = SCHEMA.split(';').map((s) => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    await query(stmt);
  }
  return mode;
}

function backend() {
  return mode;
}

async function closeDb() {
  if (mode === 'pg' && pool) await pool.end();
  if (mode === 'pglite' && pglite) await pglite.close();
  mode = 'pending';
  pool = null;
  pglite = null;
}

module.exports = { query, initDb, backend, closeDb };
