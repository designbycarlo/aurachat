import { json, isValidEmail, createRateLimiter, clientIp } from '../../../_lib/http.js';
import * as store from '../../../_lib/store.js';

const resetLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // reset requests per IP + email
  key: (req) => `${clientIp(req)}|reset`,
});

export const onRequestPost = async ({ request, env }) => {
  const lim = resetLimiter(request);
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
  if (!isValidEmail(email)) return json({ error: 'Please provide a valid email address' }, 400);
  // Always return the same response to avoid account enumeration.
  if (await store.findByEmail(env, email)) {
    const token = await store.createResetToken(env, email);
    // In production a real email would be sent here. The dev/console returns it
    // so the reset flow is testable without an email provider.
    return json({ ok: true, resetToken: token, message: 'If that email exists, a reset link will be sent.' }, 200);
  }
  return json({ ok: true, message: 'If that email exists, a reset link will be sent.' }, 200);
};
