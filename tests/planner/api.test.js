import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { createHandler } from '../../plugins/planner-api.js';
import { verifyPlan } from '../../plugins/planner-core.js';

let dir;
let file;
let server;
let base;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'planner-api-'));
  file = join(dir, 'data', 'plans.json');
  const handler = createHandler(file);
  server = createServer((req, res) =>
    handler(req, res, () => {
      res.statusCode = 404;
      res.end('not the api');
    }),
  );
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  // A non-root base, like GitHub Pages' /<repo>/, must work too.
  base = `http://127.0.0.1:${server.address().port}/repo/api/plans`;
});

afterAll(async () => {
  server.close();
  await rm(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  await rm(join(dir, 'data'), { recursive: true, force: true });
});

const json = { 'Content-Type': 'application/json' };
const post = (body) => fetch(base, { method: 'POST', headers: json, body: JSON.stringify(body) });
const valid = { title: 'Ship planner', tasks: ['- [ ] api', 'ui'], start: '2025-11-03', end: '2025-11-09', tag: 'web' };

describe('planner API', () => {
  test('GET creates a missing file and reports writable', async () => {
    const res = await fetch(`${base}?t=1`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 1, plans: [], writable: true, file: 'public/data/plans.json' });
    expect(await readFile(file, 'utf8')).toBe('{\n  "version": 1,\n  "plans": []\n}\n');
  });

  test('POST seals, PATCH toggles, DELETE breaks the seal', async () => {
    const res = await post(valid);
    expect(res.status).toBe(201);
    const plan = await res.json();
    expect(plan.id).toBe(plan.hash.slice(0, 10));
    expect(plan.tasks.map((t) => t.text)).toEqual(['api', 'ui']);
    expect(await verifyPlan(plan)).toBe(true);

    const patched = await fetch(`${base}/${plan.id}`, { method: 'PATCH', headers: json, body: JSON.stringify({ task: 1, done: true }) });
    expect(patched.status).toBe(200);
    const after = await patched.json();
    expect(after.tasks[1].done).toBe(true);
    expect(after.tasks[1].doneAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(after.hash).toBe(plan.hash);

    const stored = JSON.parse(await readFile(file, 'utf8'));
    expect(stored.plans).toHaveLength(1);
    expect(stored.plans[0].tasks[1].done).toBe(true);

    expect((await fetch(`${base}/${plan.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await (await fetch(base)).json()).plans).toEqual([]);
  });

  test('concurrent POSTs are serialized and sorted by start', async () => {
    const results = await Promise.all([
      post({ ...valid, title: 'later', start: '2025-12-01', end: '2025-12-02' }),
      post({ ...valid, title: 'earlier', start: '2025-10-01', end: '2025-10-02' }),
      post({ ...valid, title: 'middle' }),
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
    const stored = JSON.parse(await readFile(file, 'utf8'));
    expect(stored.plans.map((p) => p.title)).toEqual(['earlier', 'middle', 'later']);
  });

  test('validation errors are 400 with a field', async () => {
    const res = await post({ ...valid, start: '2025-11-10', end: '2025-11-01' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'end is before start', field: 'end' });
    expect((await post({ ...valid, title: '' })).status).toBe(400);
  });

  test('PATCH cannot change sealed content', async () => {
    const plan = await (await post(valid)).json();
    const res = await fetch(`${base}/${plan.id}`, { method: 'PATCH', headers: json, body: JSON.stringify({ task: 0, done: true, title: 'x' }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/immutable/);
  });

  test('content type, body size, method, unknown id', async () => {
    expect((await fetch(base, { method: 'POST', body: JSON.stringify(valid) })).status).toBe(415);
    expect((await fetch(base, { method: 'POST', headers: json, body: '{nope' })).status).toBe(400);
    expect((await fetch(base, { method: 'POST', headers: json, body: JSON.stringify({ ...valid, notes: 'x'.repeat(70000) }) })).status).toBe(413);
    expect((await fetch(base, { method: 'PUT', headers: json, body: '{}' })).status).toBe(405);
    expect((await fetch(`${base}/abc`, { method: 'GET' })).status).toBe(405);
    expect((await fetch(`${base}/0000000000`, { method: 'DELETE' })).status).toBe(404);
    expect((await fetch(`${base}/0000000000`, { method: 'PATCH', headers: json, body: '{"task":0,"done":true}' })).status).toBe(404);
  });

  test('a malformed file is reported and never overwritten', async () => {
    await fetch(base); // create the file
    await writeFile(file, '{"version": 1, "plans": [', 'utf8');
    const res = await post(valid);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/malformed/);
    expect(await readFile(file, 'utf8')).toBe('{"version": 1, "plans": [');
    expect((await fetch(base)).status).toBe(500);
  });

  test('other paths fall through', async () => {
    const res = await fetch(base.replace('/api/plans', '/api/other'));
    expect(await res.text()).toBe('not the api');
  });

  test('non-loopback clients get 403', async () => {
    const handler = createHandler(file);
    const res = {
      headers: {},
      setHeader(k, v) {
        this.headers[k] = v;
      },
      end(body) {
        this.body = body;
      },
    };
    handler({ url: '/api/plans', method: 'GET', headers: {}, socket: { remoteAddress: '192.168.1.20' } }, res, () => {
      throw new Error('should not fall through');
    });
    expect(res.statusCode).toBe(403);
  });
});
