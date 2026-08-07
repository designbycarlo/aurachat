import { json, requireUser } from '../_lib/http.js';
import * as store from '../_lib/store.js';

export const onRequestPost = async ({ request, env }) => {
  const user = await requireUser(env, request);
  if (!user) return json({ error: 'Authentication required' }, 401);
  let report;
  try {
    report = await request.json();
  } catch {
    return json({ error: 'Report data is required' }, 400);
  }
  if (!report || typeof report !== 'object' || !report.signals || typeof report.signals !== 'object') {
    return json({ error: 'Report data is required' }, 400);
  }
  try {
    const saved = await store.addReport(env, user.id, report);
    return json({ id: saved.id, createdAt: saved.created_at }, 201);
  } catch (err) {
    console.error('addReport error:', err);
    return json({ error: 'Internal error' }, 500);
  }
};

export const onRequestGet = async ({ request, env }) => {
  const user = await requireUser(env, request);
  if (!user) return json({ error: 'Authentication required' }, 401);
  try {
    return json({ reports: await store.listReports(env, user.id) }, 200);
  } catch (err) {
    console.error('listReports error:', err);
    return json({ error: 'Internal error' }, 500);
  }
};
