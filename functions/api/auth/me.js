import { json, publicUser, requireUser } from '../../_lib/http.js';

export const onRequestGet = async ({ request, env }) => {
  const user = await requireUser(env, request);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  return json({ user: publicUser(user) }, 200);
};
