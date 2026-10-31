// Regression: in dev, public/data/*.json must be served from disk, not from
// Vite's watcher-maintained public-file list (which an atomic rewrite can
// desync, making Vite answer with the HTML page instead of the JSON).
import { createServer } from 'node:http';
import { mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createDataHandler } from '../../plugins/planner-api.js';

let dir;
let server;
let base;
const files = {};

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'planner-data-'));
  files.plans = join(dir, 'plans.json');
  files['google-events'] = join(dir, 'google-events.json');
  await writeFile(files.plans, '{"version":1,"plans":[]}\n');
  const handler = createDataHandler(files);
  server = createServer((req, res) =>
    handler(req, res, () => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html');
      res.end('<!doctype html>fallback');
    }),
  );
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  server.close();
  await rm(dir, { recursive: true, force: true });
});

test('serves the current file contents as JSON under any base, with no-store', async () => {
  const res = await fetch(`${base}/repo/data/plans.json?x=1`);
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toContain('application/json');
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(await res.json()).toEqual({ version: 1, plans: [] });
});

test('reflects an atomic tmp+rename rewrite immediately', async () => {
  const tmp = `${files['google-events']}.tmp`;
  await writeFile(tmp, '{"version":1,"pulledAt":"2026-11-01T00:00:00.000Z","events":[]}\n');
  await rename(tmp, files['google-events']);
  const res = await fetch(`${base}/data/google-events.json`);
  expect(res.headers.get('content-type')).toContain('application/json');
  expect((await res.json()).pulledAt).toBe('2026-11-01T00:00:00.000Z');
});

test('missing file is a JSON 404, other paths fall through', async () => {
  await rm(files['google-events']);
  const missing = await fetch(`${base}/data/google-events.json`);
  expect(missing.status).toBe(404);
  expect(missing.headers.get('content-type')).toContain('application/json');
  const other = await fetch(`${base}/data/other.json`);
  expect(await other.text()).toContain('fallback');
});
