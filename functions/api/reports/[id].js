import { json, requireUser } from '../../_lib/http.js';
import * as store from '../../_lib/store.js';

export const onRequestGet = async ({ request, env, params }) => {
  const user = await requireUser(env, request);
  if (!user) return json({ error: 'Authentication required' }, 401);
  try {
    const rec = await store.getReport(env, user.id, params.id);
    if (!rec) return json({ error: 'Report not found' }, 404);
    return json({ report: JSON.parse(rec.report) }, 200);
  } catch (err) {
    console.error('getReport error:', err);
    return json({ error: 'Internal error' }, 500);
  }
};

export const onRequestDelete = async ({ request, env, params }) => {
  const user = await requireUser(env, request);
  if (!user) return json({ error: 'Authentication required' }, 401);
  try {
    if (!(await store.deleteReport(env, user.id, params.id))) {
      return json({ error: 'Report not found' }, 404);
    }
    return json({ ok: true }, 200);
  } catch (err) {
    console.error('deleteReport error:', err);
    return json({ error: 'Internal error' }, 500);
  }
};
