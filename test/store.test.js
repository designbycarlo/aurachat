/* Integration test for the Postgres-backed store.
 * Runs against embedded PGlite (real Postgres) so the schema and queries are
 * verified with true Postgres SQL semantics — no external server needed.
 * Run with: npm test   (no DATABASE_URL required)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const store = require('../data-store');
const db = require('../db');

const PGLITE_DIR = path.join(__dirname, '..', 'data-pglite');

function fail(msg, err) {
  console.error('FAIL:', msg);
  if (err) console.error(err);
  process.exitCode = 1;
}

(async () => {
  // Start from a clean slate so the test is deterministic.
  fs.rmSync(PGLITE_DIR, { recursive: true, force: true });

  const backend = await db.initDb();
  console.log('Using backend:', backend);
  assert.strictEqual(backend, 'pglite', 'expected pglite fallback when DATABASE_URL unset');

  // --- register / login flow ---
  const email = 'test@example.com';
  const password = 'sup3rsecret';

  assert.strictEqual(await store.findByEmail(email), null, 'user should not exist yet');
  const user = await store.createUser(email, password);
  assert.ok(user.id, 'user has id');
  assert.strictEqual(user.email, email);
  assert.notStrictEqual(user.passHash, password, 'password is hashed');

  const dupEmail = await store.createUser(email, password).catch(() => 'err');
  assert.strictEqual(dupEmail, 'err', 'duplicate email should reject (UNIQUE)');

  // password verification matches server.js logic
  const fetched = await store.findByEmail(email);
  const ok = store.safeEqual(store.hashPassword(password, fetched.salt), fetched.passHash);
  const bad = store.safeEqual(store.hashPassword('wrong', fetched.salt), fetched.passHash);
  assert.strictEqual(ok, true, 'correct password verifies');
  assert.strictEqual(bad, false, 'wrong password rejects');

  // --- session / cookie auth ---
  const token = await store.createSession(user.id);
  assert.ok(token, 'session token created');
  const authed = await store.userForToken(token);
  assert.strictEqual(authed.id, user.id, 'userForToken resolves the session user');

  assert.strictEqual(await store.userForToken('bogus'), null, 'bad token -> null');
  await store.destroySession(token);
  assert.strictEqual(await store.userForToken(token), null, 'destroyed session no longer valid');

  // --- saved reports ---
  // create a fresh session for cookie-driven handler flow
  const token2 = await store.createSession(user.id);
  const sampleReport = {
    signals: { url: 'https://example.com', title: 'Example', metaDescription: 'x'.repeat(40) },
    score: 82,
    grade: 'A',
    strengths: ['clean title'],
    weaknesses: [],
    recommendations: ['add FAQ'],
  };
  const saved = await store.addReport(user.id, sampleReport);
  assert.ok(saved.id, 'report saved with id');
  assert.strictEqual(saved.url, 'https://example.com');
  assert.strictEqual(saved.score, 82);

  const list = await store.listReports(user.id);
  assert.strictEqual(list.length, 1, 'one report listed');
  assert.strictEqual(list[0].id, saved.id);
  assert.strictEqual(list[0].grade, 'A');
  assert.strictEqual(list[0].score, 82, 'flat score preserved in list');
  assert.ok(list[0].report, 'list includes full report JSON');
  assert.strictEqual(list[0].report.score, 82, 'nested report.score preserved in list');

  const got = await store.getReport(user.id, saved.id);
  assert.ok(got, 'getReport returns record');
  assert.strictEqual(got.report.score, 82, 'nested report JSON preserved');

  // isolation: another user cannot read this report
  const other = await store.createUser('other@example.com', password);
  assert.strictEqual(await store.getReport(other.id, saved.id), null, 'cross-user report isolation');
  assert.strictEqual((await store.listReports(other.id)).length, 0, 'other user has no reports');

  assert.strictEqual(await store.deleteReport(user.id, saved.id), true, 'delete succeeds');
  assert.strictEqual(await store.getReport(user.id, saved.id), null, 'report gone after delete');
  assert.strictEqual(await store.deleteReport(user.id, saved.id), false, 'delete missing -> false');

  // --- password reset flow ---
  const resetToken = await store.createResetToken(email);
  assert.ok(resetToken, 'reset token created');
  const resetUser = await store.consumeResetToken(resetToken);
  assert.strictEqual(resetUser.id, user.id, 'consume returns the user');
  assert.strictEqual(await store.consumeResetToken(resetToken), null, 'reset token single-use');
  // update password and re-verify
  await store.updatePassword(user.id, 'newp@ssw0rd');
  const refetched = await store.findByEmail(email);
  assert.strictEqual(store.safeEqual(store.hashPassword('newp@ssw0rd', refetched.salt), refetched.passHash), true, 'updated password verifies');

  // reset token for unknown email returns null (no enumeration)
  assert.strictEqual(await store.createResetToken('nobody@example.com'), null, 'unknown email -> null reset token');

  await db.closeDb();
  if (process.exitCode) {
    console.error('\nSome assertions failed.');
  } else {
    console.log('\nAll store integration assertions passed.');
  }
  process.exit(process.exitCode || 0);
})().catch((err) => fail('unhandled exception', err));
