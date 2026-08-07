import { json, publicUser, loginRateLimit, clientIp } from '../../_lib/http.js';
import * as store from '../../_lib/store.js';
import { setAuthCookie } from '../../_lib/auth.js';

export const onRequestPost = async ({ request, env }) => {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');
  const lim = await loginRateLimit(env, clientIp(request), email);
  if (lim.blocked) return json({ error: 'Too many attempts, please try again later.' }, 429, lim.headers);
  try {
    const user = await store.findByEmail(env, email);
    if (!user || !store.safeEqual(await store.hashPassword(password, user.salt), user.passHash)) {
      return json({ error: 'Invalid email or password' }, 401);
    }
    const token = await store.createSession(env, user.id);
    const headers = new Headers();
    setAuthCookie(headers, request, token);
    return json({ user: publicUser(user) }, 200, headers);
  } catch (err) {
    console.error('login error:', err);
    return json({ error: 'Internal error' }, 500);
  }
};
