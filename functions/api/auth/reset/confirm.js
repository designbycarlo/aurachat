import { json, publicUser } from '../../../_lib/http.js';
import * as store from '../../../_lib/store.js';
import { setAuthCookie } from '../../../_lib/auth.js';

export const onRequestPost = async ({ request, env }) => {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const token = String(body?.token || '').trim();
  const password = String(body?.password || '');
  if (!token || password.length < 8) {
    return json({ error: 'Token and password (min 8 chars) are required' }, 400);
  }
  try {
    const user = await store.consumeResetToken(env, token);
    if (!user) return json({ error: 'Invalid or expired reset link' }, 400);
    await store.updatePassword(env, user.id, password);
    const sessionToken = await store.createSession(env, user.id);
    const headers = new Headers();
    setAuthCookie(headers, request, sessionToken);
    return json({ ok: true, user: publicUser(user) }, 200, headers);
  } catch (err) {
    console.error('reset confirm error:', err);
    return json({ error: 'Internal error' }, 500);
  }
};
