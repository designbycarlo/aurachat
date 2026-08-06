/* Postgres-backed store for user accounts, sessions and saved reports.
 *
 * The previous version was a JSON file on the container filesystem, which
 * Railway's ephemeral storage wiped on every redeploy and which could not be
 * shared across instances. Everything here now lives in Postgres (Railway's
 * managed add-on via DATABASE_URL, or embedded PGlite for local dev — see
 * db.js). All functions are async and use the unified query() interface.
 *
 * Passwords are still hashed with scrypt + per-user salt; only the persistence
 * layer changed. Reset tokens and sessions are server-side (no longer in a
 * cookie-decoded blob) and expire via expires_at columns.
 */

const crypto = require('crypto');
const db = require('./db');

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const SCRYPT_KEYLEN = 64;

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
}

function newSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function newId() {
  return crypto.randomBytes(12).toString('hex');
}

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Map a Postgres row (snake_case columns) to the app's user object
// (camelCase keys: id, email, salt, passHash, createdAt).
function rowToUser(row) {
  if (!row) return row;
  return {
    id: row.id,
    email: row.email,
    salt: row.salt,
    passHash: row.pass_hash,
    createdAt: Number(row.created_at),
  };
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

async function findByEmail(email) {
  const res = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  return rowToUser(res.rows[0] || null);
}

async function findById(id) {
  const res = await db.query('SELECT * FROM users WHERE id = $1', [id]);
  return rowToUser(res.rows[0] || null);
}

async function createUser(email, password) {
  const salt = newSalt();
  const user = {
    id: newId(),
    email,
    salt,
    pass_hash: hashPassword(password, salt),
    created_at: Date.now(),
  };
  await db.query(
    'INSERT INTO users (id, email, salt, pass_hash, created_at) VALUES ($1, $2, $3, $4, $5)',
    [user.id, user.email, user.salt, user.pass_hash, user.created_at]
  );
  return user;
}

async function createSession(userId) {
  const token = newToken();
  const now = Date.now();
  await db.query(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)',
    [token, userId, now, now + SESSION_TTL_MS]
  );
  return token;
}

async function userForToken(token) {
  if (!token) return null;
  const sres = await db.query('SELECT * FROM sessions WHERE token = $1', [token]);
  const session = sres.rows[0];
  if (!session) return null;
  if (session.expires_at < Date.now()) {
    await destroySession(token);
    return null;
  }
  return findById(session.user_id);
}

async function destroySession(token) {
  await db.query('DELETE FROM sessions WHERE token = $1', [token]);
}

async function addReport(userId, report) {
  const rec = {
    id: newId(),
    userId,
    created_at: Date.now(),
    url: String(report.signals?.url || ''),
    title: String(report.signals?.title || ''),
    score: report.score ?? 0,
    grade: report.grade || '--',
    report,
  };
  await db.query(
    `INSERT INTO reports (id, user_id, created_at, url, title, score, grade, report)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [rec.id, rec.userId, rec.created_at, rec.url, rec.title, rec.score, rec.grade, JSON.stringify(rec.report)]
  );
  return rec;
}

async function listReports(userId) {
  const res = await db.query(
    'SELECT id, created_at, url, title, score, grade, report FROM reports WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return res.rows.map(({ id, created_at, url, title, score, grade, report }) => ({
    id,
    createdAt: Number(created_at),
    url,
    title,
    score,
    grade,
    // Full report JSON (incl. `signals`) — the dashboard reads
    // `report.score` and `report.signals`, so it must be present here.
    report,
  }));
}

async function getReport(userId, reportId) {
  const res = await db.query('SELECT report FROM reports WHERE id = $1 AND user_id = $2', [reportId, userId]);
  return res.rows[0] || null;
}

async function deleteReport(userId, reportId) {
  const res = await db.query('DELETE FROM reports WHERE id = $1 AND user_id = $2', [reportId, userId]);
  return res.rowCount > 0;
}

/* --- brute-force rate-limit buckets (DB-backed, survives restarts) --- */

// Atomically return the current count for a key, opening/refreshing its window.
// Returns { count, start }. The 24h prune bound keeps the table tiny on the
// free tier; keys older than that are treated as expired and reset.
async function hitRateLimit(key, windowMs, max) {
  const now = Date.now();
  const res = await db.query(
    `INSERT INTO rate_limits (key, start, count)
       VALUES ($1, $2, 1)
     ON CONFLICT (key) DO UPDATE
       SET count = CASE
             WHEN rate_limits.start > $3 THEN rate_limits.count + 1  -- window still active -> increment
             ELSE 1                                                  -- window elapsed -> reset
           END,
           start = CASE
             WHEN rate_limits.start > $3 THEN rate_limits.start     -- keep window start
             ELSE $2                                                -- restart window
           END
     RETURNING count, start`,
    [key, now, now - windowMs]
  );
  // Lazy-prune anything older than 24h so the table can't grow unbounded.
  db.query(
    'DELETE FROM rate_limits WHERE start < $1',
    [now - 24 * 60 * 60 * 1000]
  ).catch(() => {});
  const { count, start } = res.rows[0];
  return { count, remaining: Math.max(0, max - count) };
}

async function createResetToken(email) {
  const user = await findByEmail(email);
  if (!user) return null;
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  await db.query(
    'INSERT INTO reset_tokens (token, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)',
    [token, user.id, now, now + RESET_TTL_MS]
  );
  return token;
}

async function consumeResetToken(token) {
  const tres = await db.query('SELECT * FROM reset_tokens WHERE token = $1', [token]);
  const resetToken = tres.rows[0];
  if (!resetToken) return null;
  await db.query('DELETE FROM reset_tokens WHERE token = $1', [token]);
  if (resetToken.expires_at < Date.now()) return null;
  return findById(resetToken.user_id);
}

async function updatePassword(userId, password) {
  const user = await findById(userId);
  if (!user) return false;
  const salt = newSalt();
  const passHash = hashPassword(password, salt);
  await db.query('UPDATE users SET salt = $1, pass_hash = $2 WHERE id = $3', [salt, passHash, userId]);
  return true;
}

module.exports = {
  findByEmail,
  findById,
  createUser,
  createSession,
  userForToken,
  destroySession,
  addReport,
  listReports,
  getReport,
  deleteReport,
  hitRateLimit,
  createResetToken,
  consumeResetToken,
  updatePassword,
  safeEqual,
  hashPassword,
  newSalt,
};
