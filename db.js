/* Database connection + schema bootstrap for AuraChat.
 *
 * Production (Render): uses `pg` against the DATABASE_URL that Render's
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

// NODE_ENV is fixed for the process lifetime, so there is no point polling
// for DATABASE_URL — if it isn't present at startup it won't appear later.
function connect() {
  if (mode !== 'pending') return;
  const url = process.env.DATABASE_URL;
  // PGlite is a full Postgres compiled to WASM that runs INSIDE this process.
  // It works great for local dev but is heavy (~100MB+) and is the thing that
  // OOM-killed the Render free tier when DATABASE_URL was absent. So it must
  // be OPT-IN: only used locally (NODE_ENV !== 'production') or when the
  // operator explicitly sets USE_PGLITE=1. In production, a missing
  // DATABASE_URL fails loud instead of silently loading PGlite and crashing.
  const wantPglite = !url && (process.env.USE_PGLITE === '1' || process.env.NODE_ENV !== 'production');
  if (url) {
    const { Pool } = require('pg');
    // Free-tier Render Postgres allows ~20 connections; the hobby dyno runs
    // a single node process, so 2 is plenty and leaves headroom for other
    // services on the shared instance. Idle clients are reaped to bound RAM.
    pool = new Pool({
      connectionString: url,
      max: 2,
      idleTimeoutMillis: 10_000,
      allowExitOnIdle: true,
    });
    pool.on('error', (err) => console.error('Unexpected Postgres pool error:', err));
    mode = 'pg';
    console.log('[db] Using managed Postgres (DATABASE_URL)');
  } else if (wantPglite) {
    const { PGlite } = require('@electric-sql/pglite');
    // Persist to a local data dir so dev sessions survive restarts.
    const dir = path.join(__dirname, 'data-pglite');
    pglite = new PGlite(dir);
    mode = 'pglite';
    console.log('[db] Using embedded PGlite (local dev / USE_PGLITE=1)');
  } else {
    // Production without DATABASE_URL: refuse to start rather than OOM on PGlite.
    mode = 'failed';
    throw new Error(
      'DATABASE_URL is not set. Set DATABASE_URL (Render Postgres) or run locally with USE_PGLITE=1. ' +
      'Refusing to start without a database to avoid loading the in-process PGlite engine (OOM risk on low-RAM hosts).'
    );
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

/* ------------------------------------------------------------------ *\
 * Versioned migrations
 *
 * Applies any pending ./migrations/<NNNN>_*.sql in order, exactly once per
 * database. Each file is executed as a single unit (inside a transaction)
 * and its version recorded in schema_migrations. This makes the schema
 * evolvable without data loss or manual ALTERs, and lets an existing
 * database (already-created tables) treat the initial migration as a no-op.
 *
 * Why this helps security posture: a tracked, replayable schema is what lets
 * us harden credentials later (e.g. migrate hashes to a stronger KDF) and add
 * abuse-mitigation columns without breaking existing accounts — and the
 * boot-time failure below means a broken DB fails fast instead of serving a
 * silently-broken auth system.
 * ------------------------------------------------------------------ */
let migrationsDir = path.join(__dirname, 'migrations');

async function ensureMigrationsTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version TEXT PRIMARY KEY,
       applied_at BIGINT NOT NULL
     )`
  );
}

async function appliedVersions() {
  await ensureMigrationsTable();
  const res = await query('SELECT version FROM schema_migrations');
  return new Set(res.rows.map((r) => r.version));
}

async function runSqlFile(file) {
  const sql = fs.readFileSync(file, 'utf8');
  if (mode === 'pg') {
    // Real Postgres: wrap in a transaction so a failed migration rolls back.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } else {
    // PGlite: transactions are supported but each query is auto-committed per
    // statement; run the file's statements split on ';' (migrations are plain
    // DDL, no PL/pgSQL with internal semicolons). If a statement fails the
    // whole migrate() rejects and the process exits non-zero.
    const statements = sql.split(';').map((s) => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      await query(stmt);
    }
  }
}

async function migrate({ dir = migrationsDir } = {}) {
  connect();
  const done = await appliedVersions();
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort();

  let applied = 0;
  for (const f of files) {
    const version = f.replace(/_.*$/, '');
    if (done.has(version)) continue; // already applied — skip (idempotent)
    console.log(`[migrate] applying ${f}`);
    await runSqlFile(path.join(dir, f));
    await query('INSERT INTO schema_migrations (version, applied_at) VALUES ($1, $2)', [
      version,
      Date.now(),
    ]);
    applied += 1;
  }
  if (applied === 0) console.log('[migrate] already up to date');
  return { applied, total: files.length };
}

module.exports = { query, initDb, backend, closeDb, migrate };
