#!/usr/bin/env node
/* Standalone migration runner — intended for a deploy `releaseCommand`
 * (e.g. Railway) and local use (`npm run migrate`).
 *
 * Applies any pending ./migrations/*.sql against the active backend (managed
 * Postgres via DATABASE_URL, or embedded PGlite for local dev) and exits.
 *
 * Deliberately minimal: it imports only ./db, never Express or any app code,
 * so it uses almost no memory — important on Railway's free tier where RAM is
 * tight. The server can also run migrations at boot as a safety net, but the
 * canonical apply happens here, once, before the app starts.
 */
const db = require('./db');

db.migrate()
  .then(() => {
    console.log('[migrate] complete');
    return db.closeDb();
  })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[migrate] failed:', err);
    process.exit(1);
  });
