// D1-backed data access. Ported from data-store.js (Postgres). Same function
// names/behaviors so the route handlers map 1:1. `env.DB` is the D1 binding.

import { newId, newToken, hashPassword, newSalt, safeEqual } from './auth.js';

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

export async function findByEmail(env, email) {
  const res = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).all();
  return rowToUser(res.results[0] || null);
}

export async function findById(env, id) {
  const res = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).all();
  return rowToUser(res.results[0] || null);
}

export async function createUser(env, email, password) {
  const salt = newSalt();
  const user = {
    id: newId(),
    email,
    salt,
    pass_hash: await hashPassword(password, salt),
    created_at: Date.now(),
  };
  await env.DB.prepare(
    'INSERT INTO users (id, email, salt, pass_hash, created_at) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(user.id, user.email, user.salt, user.pass_hash, user.created_at)
    .run();
  return user;
}

export async function createSession(env, userId) {
  const token = newToken();
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  )
    .bind(token, userId, now, now + 30 * 24 * 60 * 60 * 1000)
    .run();
  return token;
}

export async function userForToken(env, token) {
  if (!token) return null;
  const res = await env.DB.prepare('SELECT * FROM sessions WHERE token = ?').bind(token).all();
  const session = res.results[0];
  if (!session) return null;
  if (session.expires_at < Date.now()) {
    await destroySession(env, token);
    return null;
  }
  return findById(env, session.user_id);
}

export async function destroySession(env, token) {
  await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
}

export async function addReport(env, userId, report) {
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
  await env.DB.prepare(
    `INSERT INTO reports (id, user_id, created_at, url, title, score, grade, report)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(rec.id, rec.userId, rec.created_at, rec.url, rec.title, rec.score, rec.grade, JSON.stringify(rec.report))
    .run();
  return rec;
}

export async function listReports(env, userId) {
  const res = await env.DB.prepare(
    'SELECT id, created_at, url, title, score, grade, report FROM reports WHERE user_id = ? ORDER BY created_at DESC'
  )
    .bind(userId)
    .all();
  return (res.results || []).map((r) => ({
    id: r.id,
    createdAt: Number(r.created_at),
    url: r.url,
    title: r.title,
    score: r.score,
    grade: r.grade,
    // Full report JSON (incl. `signals`) — the dashboard reads report.score and report.signals.
    report: JSON.parse(r.report),
  }));
}

export async function getReport(env, userId, reportId) {
  const res = await env.DB.prepare('SELECT report FROM reports WHERE id = ? AND user_id = ?')
    .bind(reportId, userId)
    .all();
  return res.results[0] || null;
}

export async function deleteReport(env, userId, reportId) {
  const info = await env.DB.prepare('DELETE FROM reports WHERE id = ? AND user_id = ?')
    .bind(reportId, userId)
    .run();
  return info.success && info.meta.changes > 0;
}

/* --- brute-force rate-limit buckets (DB-backed, survives restarts) --- */

// Atomically return the current count for a key, opening/refreshing its window.
export async function hitRateLimit(env, key, windowMs, max) {
  const now = Date.now();
  const res = await env.DB.prepare(
    `INSERT INTO rate_limits (key, start, count) VALUES (?, ?, 1)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN rate_limits.start > ? THEN rate_limits.count + 1 ELSE 1 END,
       start = CASE WHEN rate_limits.start > ? THEN rate_limits.start ELSE ? END
     RETURNING count, start`
  )
    .bind(key, now, now - windowMs, now - windowMs, now)
    .all();
  // Lazy-prune anything older than 24h so the table can't grow unbounded.
  env.DB.prepare('DELETE FROM rate_limits WHERE start < ?')
    .bind(now - 24 * 60 * 60 * 1000)
    .run()
    .catch(() => {});
  const { count, start } = res.results[0];
  return { count, remaining: Math.max(0, max - count) };
}

export async function createResetToken(env, email) {
  const user = await findByEmail(env, email);
  if (!user) return null;
  const token = newToken();
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO reset_tokens (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  )
    .bind(token, user.id, now, now + 60 * 60 * 1000)
    .run();
  return token;
}

export async function consumeResetToken(env, token) {
  const res = await env.DB.prepare('SELECT * FROM reset_tokens WHERE token = ?').bind(token).all();
  const resetToken = res.results[0];
  if (!resetToken) return null;
  await env.DB.prepare('DELETE FROM reset_tokens WHERE token = ?').bind(token).run();
  if (resetToken.expires_at < Date.now()) return null;
  return findById(env, resetToken.user_id);
}

export async function updatePassword(env, userId, password) {
  const user = await findById(env, userId);
  if (!user) return false;
  const salt = newSalt();
  const passHash = await hashPassword(password, salt);
  await env.DB.prepare('UPDATE users SET salt = ?, pass_hash = ? WHERE id = ?')
    .bind(salt, passHash, userId)
    .run();
  return true;
}

export { safeEqual, hashPassword, newSalt };
