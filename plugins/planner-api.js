// Planner JSON API for `vite` (dev) and `vite preview`. Stores sealed plans in
// public/data/plans.json, which the static build copies to dist/data/ — that
// copy is what GitHub Pages serves read-only after a push. See docs/PLANNER.md.
//
//   GET    …/api/plans        -> { version, plans, writable, file }
//   POST   …/api/plans        -> 201 sealed plan
//   PATCH  …/api/plans/:id    -> 200 plan (task done-state only)
//   DELETE …/api/plans/:id    -> 204 (break seal)
//
// The same plugin mounts Google Calendar sync (…/api/google/*, see
// plugins/google-sync.js) behind the same loopback-only guard.
import { readFile, rename, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createGoogleHandler, resolveHome } from './google-sync.js';
import { HttpError, isLoopbackClient, readJsonBody, send } from './http.js';
import { assertStore, sealPlan, serializeStore, toggleTask, validatePlanInput, validateToggle } from './planner-core.js';

export const DATA_FILE = 'public/data/plans.json';
export const EVENTS_FILE = 'public/data/google-events.json';
const ROUTE_RE = /\/api\/plans(?:\/([^/]+))?\/?$/;
const DATA_RE = /\/data\/(plans|google-events)\.json$/;

/**
 * Serves public/data/*.json straight from disk in dev and preview.
 * Vite's own public-file serving keeps an in-memory list updated by the file
 * watcher; an atomic rewrite (tmp + rename) can drop the file from that list,
 * after which Vite answers with the HTML page instead. Reading from disk on
 * every request removes that dependency. The static Pages build is unaffected.
 */
export function createDataHandler(files) {
  return function plannerDataMiddleware(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const match = DATA_RE.exec((req.url || '').split('?')[0]);
    if (!match) return next();
    readFile(files[match[1]], 'utf8').then(
      (text) => {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(req.method === 'HEAD' ? undefined : text);
      },
      (err) => (err.code === 'ENOENT' ? send(res, 404, { error: `${match[0].slice(1)} not found` }) : next(err)),
    );
  };
}

/**
 * File-backed store. Every read-modify-write runs through one promise queue.
 * `exclusive(fn)` runs fn({ read }) in that queue too, so Google sync never
 * interleaves with a plan write.
 */
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
    exclusive: (fn) => serial(() => fn({ read })),
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
export function createHandler(file, store = createStore(file)) {
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
    if (!isLoopbackClient(req)) {
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
  let root;
  let file;
  // One store per server, shared with Google sync so their writes queue together.
  const install = (server) => {
    const store = createStore(file);
    // Refuses to start when PLANNER_CAL_HOME points inside the repository.
    const home = resolveHome({ root });
    server.middlewares.use(createDataHandler({ plans: file, 'google-events': resolve(root, EVENTS_FILE) }));
    server.middlewares.use(createHandler(file, store));
    server.middlewares.use(createGoogleHandler({ home, store, eventsFile: resolve(root, EVENTS_FILE) }));
  };
  return {
    name: 'planner-api',
    // Our own writes to public/data/ are not source changes: keep them out of
    // the watcher, so they never reload the page or touch Vite's public-file list.
    config: () => ({ server: { watch: { ignored: ['**/public/data/**'] } } }),
    configResolved(config) {
      root = config.root;
      file = resolve(root, DATA_FILE);
    },
    configureServer: install,
    configurePreviewServer: install,
  };
}
