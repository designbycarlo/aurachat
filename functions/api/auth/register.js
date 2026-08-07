import { json, publicUser, isValidEmail, createRateLimiter, clientIp } from '../../_lib/http.js';
import * as store from '../../_lib/store.js';
import { setAuthCookie } from '../../_lib/auth.js';

const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // new accounts per IP
  key: (req) => `${clientIp(req)}|register`,
});

export const onRequestPost = async ({ request, env }) => {
  const lim = registerLimiter(request);
  if (lim.blocked) {
    return json({ error: 'Too many attempts, please try again later.' }, 429, lim.headers);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');
  if (!isValidEmail(email)) return json({ error: 'Please provide a valid email address' }, 400);
  if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400);
  try {
    if (await store.findByEmail(env, email)) {
      return json({ error: 'An account with that email already exists' }, 409);
    }
    const user = await store.createUser(env, email, password);
    const token = await store.createSession(env, user.id);
    const headers = new Headers();
    setAuthCookie(headers, request, token);
    return json({ user: publicUser(user) }, 201, headers);
  } catch (err) {
    console.error('register error:', err);
    return json({ error: 'Internal error' }, 500);
  }
};
