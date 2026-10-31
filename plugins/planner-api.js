// Planner JSON API for `vite` (dev) and `vite preview`. Stores sealed plans in
// public/data/plans.json, which the static build copies to dist/data/ — that
// copy is what GitHub Pages serves read-only after a push. See docs/PLANNER.md.
//
//   GET    …/api/plans        -> { version, plans, writable, file }
//   POST   …/api/plans        -> 201 sealed plan
//   PATCH  …/api/plans/:id    -> 200 plan (task done-state only)
//   DELETE …/api/plans/:id    -> 204 (break seal)
import { readFile, rename, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { assertStore, sealPlan, serializeStore, toggleTask, validatePlanInput, validateToggle } from './planner-core.js';

export const DATA_FILE = 'public/data/plans.json';
const BODY_LIMIT = 64 * 1024;
const ROUTE_RE = /\/api\/plans(?:\/([^/]+))?\/?$/;
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

class HttpError extends Error {
  constructor(status, message, field) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  if (body === undefined) return res.end();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') return Promise.reject(new HttpError(415, 'Content-Type must be application/json'));
  if (Number(req.headers['content-length']) > BODY_LIMIT) return Promise.reject(new HttpError(413, 'body over 64 KB'));
  return new Promise((ok, fail) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        fail(new HttpError(413, 'body over 64 KB'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', fail);
    req.on('end', () => {
      try {
        ok(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'));
      } catch {
        fail(new HttpError(400, 'body is not valid JSON'));
      }
    });
  });
}

/** File-backed store. Every read-modify-write runs through one promise queue. */
export function createStore(file) {
  let queue = Promise.resolve();
  const serial = (fn) => {
    const run = queue.then(fn);
    queue = run.catch(() => {});
    return run;
  };

  async function read() {
    let text;
    try {
      text = await readFile(file, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') throw new HttpError(500, `cannot read ${DATA_FILE}: ${err.message}`);
      await write([]);
      return [];
    }
    try {
      return assertStore(JSON.parse(text)).plans;
    } catch (err) {
      // Never overwrite a file we cannot understand: the owner fixes it by hand.
      throw new HttpError(500, `${DATA_FILE} is malformed (${err.message}). Fix or restore it (git checkout ${DATA_FILE}); it was not modified.`);
    }
  }

  async function write(plans) {
    await mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    await writeFile(tmp, serializeStore(plans), 'utf8');
    await rename(tmp, file);
  }

  return {
    list: () => serial(read),
    update: (fn) =>
      serial(async () => {
        const plans = await read();
        const { plans: next, result } = await fn(plans);
        await write(next);
        return result;
      }),
  };
}

/** Connect-style middleware. Calls next() for anything that is not the API. */
export function createHandler(file) {
  const store = createStore(file);

  async function route(req, res, id) {
    const method = req.method;
    if (!id) {
      if (method === 'GET' || method === 'HEAD') {
        const plans = await store.list();
        return send(res, 200, { version: 1, plans, writable: true, file: DATA_FILE });
      }
      if (method === 'POST') {
        const body = await readJsonBody(req);
        const check = validatePlanInput(body);
        if (!check.ok) {
          const [field, error] = Object.entries(check.errors)[0];
          throw new HttpError(400, error, field);
        }
        const plan = await store.update(async (plans) => {
          const sealed = await sealPlan(check.value);
          if (plans.some((p) => p.id === sealed.id)) throw new HttpError(409, 'a plan with this id already exists; try again');
          return { plans: [...plans, sealed], result: sealed };
        });
        return send(res, 201, plan);
      }
      return send(res, 405, { error: `${method} not allowed on /api/plans` }, { Allow: 'GET, HEAD, POST' });
    }

    if (method === 'PATCH') {
      const body = await readJsonBody(req);
      const plan = await store.update(async (plans) => {
        const i = plans.findIndex((p) => p.id === id);
        if (i === -1) throw new HttpError(404, `no plan ${id}`);
        const error = validateToggle(body, plans[i]);
        if (error) throw new HttpError(400, error);
        const next = toggleTask(plans[i], body.task, body.done);
        return { plans: plans.with(i, next), result: next };
      });
      return send(res, 200, plan);
    }
    if (method === 'DELETE') {
      await store.update(async (plans) => {
        if (!plans.some((p) => p.id === id)) throw new HttpError(404, `no plan ${id}`);
        return { plans: plans.filter((p) => p.id !== id), result: null };
      });
      return send(res, 204);
    }
    return send(res, 405, { error: `${method} not allowed on /api/plans/:id` }, { Allow: 'PATCH, DELETE' });
  }

  return function plannerApiMiddleware(req, res, next) {
    const path = (req.url || '').split('?')[0];
    const match = ROUTE_RE.exec(path);
    if (!match) return next();
    if (!LOOPBACK.has(req.socket?.remoteAddress)) {
      return send(res, 403, { error: 'the planner API only answers loopback clients' });
    }
    // Plan ids are hex, so the raw path segment is compared as-is.
    route(req, res, match[1]).catch((err) => {
      if (err instanceof HttpError) {
        return send(res, err.status, err.field ? { error: err.message, field: err.field } : { error: err.message });
      }
      send(res, 500, { error: err.message || 'internal error' });
    });
  };
}

export default function plannerApi() {
  let file;
  return {
    name: 'planner-api',
    configResolved(config) {
      file = resolve(config.root, DATA_FILE);
    },
    configureServer(server) {
      server.middlewares.use(createHandler(file));
    },
    configurePreviewServer(server) {
      server.middlewares.use(createHandler(file));
    },
  };
}
