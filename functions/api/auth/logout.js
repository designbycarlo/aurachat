import { json } from '../../_lib/http.js';
import * as store from '../../_lib/store.js';
import { tokenFromRequest, clearAuthCookie } from '../../_lib/auth.js';

export const onRequestPost = async ({ request, env }) => {
  const token = tokenFromRequest(request);
  if (token) {
    try {
      await store.destroySession(env, token);
    } catch (err) {
      console.error('logout error:', err);
    }
  }
  const headers = new Headers();
  clearAuthCookie(headers, request);
  return json({ ok: true }, 200, headers);
};
