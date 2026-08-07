// Auth primitives for the Workers runtime.
//
// Password hashing uses scrypt with the SAME parameters as Node's
// `crypto.scryptSync(password, salt, 64)` (N=16384, r=8, p=1, 64-byte output)
// via @noble/hashes, so existing Railway password hashes migrate to D1 unchanged.
// PBKDF2 fallback is provided for environments without a secure RNG if needed.

import { scryptAsync, randomBytes } from '@noble/hashes/lib/scrypt.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

export function newSalt() {
  return bytesToHex(randomBytes(16));
}

export function newId() {
  return bytesToHex(randomBytes(12));
}

export function newToken() {
  return bytesToHex(randomBytes(32));
}

// Mirrors crypto.scryptSync(password, salt, 64).toString('hex').
export async function hashPassword(password, salt) {
  const derived = await scryptAsync(password, salt, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    dkLen: SCRYPT_KEYLEN,
  });
  return bytesToHex(derived);
}

export function safeEqual(a, b) {
  const ba = typeof a === 'string' ? hexToBytes(a) : a;
  const bb = typeof b === 'string' ? hexToBytes(b) : b;
  if (ba.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= ba[i] ^ bb[i];
  return diff === 0;
}

export const SESSION_TTL = SESSION_TTL_MS;
export const RESET_TTL = RESET_TTL_MS;
export { SCRYPT_KEYLEN };

/* ------------------------------ cookies ------------------------------ */

const COOKIE_NAME = 'aura_session';

export function isHttps(req) {
  const h = req.headers;
  const proto = h.get('x-forwarded-proto');
  return proto === 'https' || (req.url ? new URL(req.url).protocol === 'https:' : false);
}

export function parseCookies(req) {
  const raw = req.headers.get('cookie');
  const out = {};
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    if (!name || out[name]) continue;
    let value = part.slice(idx + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      /* leave as-is */
    }
    out[name] = value;
  }
  return out;
}

export function tokenFromRequest(req) {
  const cookies = parseCookies(req);
  const cookie = cookies[COOKIE_NAME];
  if (cookie) return cookie;
  const header = req.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

export function setAuthCookie(headers, req, token) {
  const secure = isHttps(req) ? ' Secure;' : '';
  headers.append(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  );
}

export function clearAuthCookie(headers, req) {
  const secure = isHttps(req) ? ' Secure;' : '';
  headers.append(
    'Set-Cookie',
    `${COOKIE_NAME}=; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=0`
  );
}
