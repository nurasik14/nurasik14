// Small HTTP helpers shared by the planner API and Google sync middleware.
export const BODY_LIMIT = 64 * 1024;
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** The loopback-only guard: both APIs answer this machine and nothing else. */
export const isLoopbackClient = (req) => LOOPBACK.has(req.socket?.remoteAddress);

export class HttpError extends Error {
  constructor(status, message, field) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

export function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  if (body === undefined) return res.end();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export function readJsonBody(req) {
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
