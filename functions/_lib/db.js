// D1 (serverless SQLite) query helper for Pages Functions.
// `env.DB` is the D1 binding declared in wrangler.toml. `context.waitUntil`
// keeps the runtime alive for the fire-and-forget rate-limit prune.

export function db(env) {
  return env.DB;
}

// Run a single statement. `params` is an array; D1 uses `?` placeholders.
export async function query(env, text, params = []) {
  const res = await env.DB.prepare(text).bind(...params).all();
  return { rows: res.results || [], rowCount: res.results ? res.results.length : 0 };
}

// Run a statement that returns the inserted row id.
export async function run(env, text, params = []) {
  const info = await env.DB.prepare(text).bind(...params).run();
  return info;
}

// File-based migrations are applied with `wrangler d1 migrations apply`.
// This helper is kept for parity/reference but the canonical apply is the CLI.
export async function ensureMigrationsTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS _migrations (version TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)`
  ).run();
}
