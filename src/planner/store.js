// Talks to the planner API when it exists (vite dev / vite preview on this
// machine) and falls back to the static snapshot that GitHub Pages serves.
import { sortPlans } from '../../plugins/planner-core.js';

const BASE = import.meta.env.BASE_URL;
const API = `${BASE}api/plans`;
const SNAPSHOT = `${BASE}data/plans.json`;

// The API only answers loopback clients, so anywhere else (GitHub Pages, a
// LAN address) skip the probe instead of logging a 404/403 in the console.
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
export const isLoopbackHost = (hostname) => LOOPBACK.has(hostname);

async function readJson(res) {
  const type = res.headers.get('content-type') || '';
  if (!type.includes('json')) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Resolve to { mode: 'local' | 'readonly', plans, file? }.
 * Throws when neither the API nor the snapshot is readable.
 */
export async function loadPlans() {
  if (isLoopbackHost(window.location.hostname)) {
    let apiError = null;
    try {
      const res = await fetch(API, { cache: 'no-store', headers: { Accept: 'application/json' } });
      const body = await readJson(res);
      if (res.ok && body?.writable === true && Array.isArray(body.plans)) {
        return { mode: 'local', plans: sortPlans(body.plans), file: body.file };
      }
      // The API exists but could not read the file (e.g. malformed JSON):
      // report that instead of quietly showing a read-only view.
      if (res.status === 500 && body?.error) apiError = body.error;
    } catch {
      // No API (a plain static server) or offline: try the snapshot.
    }
    if (apiError) throw new Error(apiError);
  }

  const res = await fetch(SNAPSHOT, { cache: 'no-store' });
  const body = res.ok ? await readJson(res) : null;
  if (!body || !Array.isArray(body.plans)) {
    throw new Error(res.ok ? 'data/plans.json is not a plans file' : `data/plans.json: HTTP ${res.status}`);
  }
  return { mode: 'readonly', plans: sortPlans(body.plans) };
}

async function call(url, method, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Object.assign(new Error('dev server unreachable — is `bun run dev` still running?'), { field: null });
  }
  if (res.status === 204) return null;
  const data = await readJson(res);
  if (!res.ok) throw Object.assign(new Error(data?.error || `HTTP ${res.status}`), { field: data?.field ?? null });
  return data;
}

export const createPlan = (input) => call(API, 'POST', input);
export const setTaskDone = (id, task, done) => call(`${API}/${id}`, 'PATCH', { task, done });
export const deletePlan = (id) => call(`${API}/${id}`, 'DELETE');
