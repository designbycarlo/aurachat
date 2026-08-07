// Shared HTTP helpers for Pages Functions.
import { tokenFromRequest } from './auth.js';
import * as store from './store.js';

export function json(data, status = 200, extraHeaders = {}) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (extraHeaders instanceof Headers) {
    for (const [k, v] of extraHeaders) headers.append(k, v);
  } else {
    for (const [k, v] of Object.entries(extraHeaders)) headers.set(k, v);
  }
  return new Response(JSON.stringify(data), { status, headers });
}

export function publicUser(user) {
  return { id: user.id, email: user.email, createdAt: user.createdAt };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(email) {
  return EMAIL_RE.test(email);
}

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX = 8;

// DB-backed brute-force limiter on the login endpoint (survives worker restarts).
export async function loginRateLimit(env, ip, email) {
  const k = `${ip}|login|${String(email || '').trim().toLowerCase()}`;
  const { count, remaining } = await store.hitRateLimit(env, k, LOGIN_WINDOW_MS, LOGIN_MAX);
  const headers = {
    'X-RateLimit-Limit': String(LOGIN_MAX),
    'X-RateLimit-Remaining': String(remaining),
  };
  if (count > LOGIN_MAX) {
    const retry = Math.ceil(LOGIN_WINDOW_MS / 1000);
    headers['Retry-After'] = String(retry);
    return { blocked: true, headers };
  }
  return { blocked: false, headers };
}

// In-memory fixed-window limiter for register/reset (per-deployment; Pages
// isolates are short-lived and these endpoints are lower-stakes than login).
const RATE_BUCKETS = new Map();
export function createRateLimiter({ windowMs, max, key }) {
  const buckets = new Map();
  let cleaner = null;
  // Lazily start the cleanup timer inside a handler (never at global scope,
  // which the Workers runtime forbids). unref so it never holds the isolate open.
  function ensureCleaner() {
    if (cleaner) return;
    cleaner = setInterval(() => {
      const now = Date.now();
      for (const [k, b] of buckets) if (now - b.start > windowMs) buckets.delete(k);
    }, Math.min(windowMs, 60000));
    if (typeof cleaner.unref === 'function') cleaner.unref();
  }
  return (req) => {
    ensureCleaner();
    const k = key(req);
    const now = Date.now();
    let bucket = buckets.get(k);
    if (!bucket || now - bucket.start > windowMs) {
      bucket = { start: now, count: 0 };
      buckets.set(k, bucket);
    }
    bucket.count += 1;
    const remaining = Math.max(0, max - bucket.count);
    const headers = {
      'X-RateLimit-Limit': String(max),
      'X-RateLimit-Remaining': String(remaining),
    };
    if (bucket.count > max) {
      const retry = Math.ceil((bucket.start + windowMs - now) / 1000);
      headers['Retry-After'] = String(retry);
      return { blocked: true, headers };
    }
    return { blocked: false, headers };
  };
}

export function clientIp(req) {
  const fwd = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return 'unknown';
}

// Resolve the authenticated user from the session cookie/token.
export async function requireUser(env, req) {
  const token = tokenFromRequest(req);
  const user = token ? await store.userForToken(env, token) : null;
  return user;
}
