/* Lightweight file-backed JSON store for user accounts, sessions and saved
 * reports. No external database dependency, so AuraChat keeps deploying
 * anywhere (Railway, Render, a $5 VPS) with zero extra setup.
 *
 * Writes go to a temp file first and are then renamed, so a crash mid-write
 * can never corrupt the store.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const EMPTY = { users: [], sessions: [], reports: [], resetTokens: [] };

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const SCRYPT_KEYLEN = 64;

let db = null;

function load() {
  if (db) return db;
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    db = { users: [], sessions: [], reports: [] };
  }
  for (const key of Object.keys(EMPTY)) {
    if (!Array.isArray(db[key])) db[key] = [];
  }
  return db;
}

function persist() {
  load();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

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

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function findByEmail(email) {
  return load().users.find((u) => u.email === email) || null;
}

function findById(id) {
  return load().users.find((u) => u.id === id) || null;
}

function createUser(email, password) {
  const salt = newSalt();
  const user = {
    id: newId(),
    email,
    salt,
    passHash: hashPassword(password, salt),
    createdAt: Date.now(),
  };
  load().users.push(user);
  persist();
  return user;
}

function createSession(userId) {
  const token = newToken();
  load().sessions.push({
    token,
    userId,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  persist();
  return token;
}

function userForToken(token) {
  if (!token) return null;
  const session = load().sessions.find((s) => s.token === token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    destroySession(token);
    return null;
  }
  return findById(session.userId);
}

function destroySession(token) {
  const sessions = load().sessions;
  const i = sessions.findIndex((s) => s.token === token);
  if (i >= 0) {
    sessions.splice(i, 1);
    persist();
  }
}

function addReport(userId, report) {
  const rec = {
    id: newId(),
    userId,
    createdAt: Date.now(),
    url: String(report.signals?.url || ''),
    title: String(report.signals?.title || ''),
    score: report.score ?? 0,
    grade: report.grade || '--',
    report,
  };
  load().reports.push(rec);
  persist();
  return rec;
}

function listReports(userId) {
  return load().reports
    .filter((r) => r.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(({ id, createdAt, url, title, score, grade }) => ({ id, createdAt, url, title, score, grade }));
}

function getReport(userId, reportId) {
  return load().reports.find((r) => r.id === reportId && r.userId === userId) || null;
}

function deleteReport(userId, reportId) {
  const reports = load().reports;
  const i = reports.findIndex((r) => r.id === reportId && r.userId === userId);
  if (i < 0) return false;
  reports.splice(i, 1);
  persist();
  return true;
}

function createResetToken(email) {
  const user = findByEmail(email);
  if (!user) return null;
  const token = crypto.randomBytes(32).toString('hex');
  load().resetTokens.push({
    token,
    userId: user.id,
    createdAt: Date.now(),
    expiresAt: Date.now() + RESET_TTL_MS,
  });
  persist();
  return token;
}

function consumeResetToken(token) {
  const tokens = load().resetTokens;
  const idx = tokens.findIndex((t) => t.token === token);
  if (idx < 0) return null;
  const resetToken = tokens[idx];
  tokens.splice(idx, 1);
  persist();
  if (resetToken.expiresAt < Date.now()) return null;
  return findById(resetToken.userId);
}

function updatePassword(userId, password) {
  const user = findById(userId);
  if (!user) return false;
  user.salt = newSalt();
  user.passHash = hashPassword(password, user.salt);
  persist();
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
  createResetToken,
  consumeResetToken,
  updatePassword,
  safeEqual,
  hashPassword,
  newSalt,
};
