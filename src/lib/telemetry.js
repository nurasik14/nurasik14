import { MODE, DATA_PATH, FETCH_TIMEOUT_MS, POLL_MS } from '../config/live.config';

/* ================================================================ *
 *  telemetry.js — bridges the dashboard to real data.
 *
 *  Two sources, one shape:
 *    'sim'  deterministic series generated in src/lib/series.js
 *    'file' public/data/telemetry.json written by your scraper
 *
 *  The scraper file is authoritative: whatever it contains wins. If it
 *  is missing, stale or malformed we fall back to the simulator rather
 *  than showing an empty panel — and tell you why via `source`.
 * ================================================================ */

const base = (import.meta.env?.BASE_URL ?? '/').replace(/\/$/, '');
export const TELEMETRY_URL = `${base}/${DATA_PATH}`;

/* Shape every source must satisfy. Documents the contract for the
   scraper AND validates real files before they reach the charts. */
export const SCHEMA = {
  jobs: 'array',        // {id,name,target,parser,cadence,records,rate,status,code}
  series: 'array',      // {ts,ingested,errors,p50,p95,queue}
  logs: 'array',        // string[]
  sourceMix: 'array',   // {src,n,pct,lang}
  meta: 'object',       // {generated_at,run_id,...}
};

function validate(d) {
  if (!d || typeof d !== 'object') return 'not an object';
  for (const [k, t] of Object.entries(SCHEMA)) {
    const want = t === 'array' ? Array.isArray : typeof d[k] === t;
    if (!want) return `missing or invalid "${k}" (expected ${t})`;
  }
  if (d.series.length === 0) return 'series is empty';
  return null;
}

/* Normalise a series row so the charts never get undefined.
   Accepts either an ISO string or epoch ms in `ts`. */
function normaliseSeries(rows) {
  return rows
    .map((r) => {
      const t = typeof r.ts === 'number' ? r.ts : Date.parse(r.ts);
      return {
        t,
        ts: typeof r.ts === 'string' && /^\d{2}:\d{2}/.test(r.ts) ? r.ts
          : new Date(t).toISOString().slice(11, 16),
        ingested: Number(r.ingested ?? 0),
        errors: Number(r.errors ?? 0),
        p50: Number(r.p50 ?? 0),
        p95: Number(r.p95 ?? 0),
        queue: Number(r.queue ?? 0),
      };
    })
    .filter((r) => Number.isFinite(r.t))
    .sort((a, b) => a.t - b.t);
}

export async function loadTelemetry(signal) {
  if (MODE !== 'file') {
    return { source: 'sim', reason: 'live.config.js MODE = "sim"', data: null };
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  const onAbort = () => ctl.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    const res = await fetch(TELEMETRY_URL, { cache: 'no-store', signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    /* a static host commonly answers a missing file with an HTML error
       page, so check before parsing or the message becomes cryptic */
    if (!text.trimStart().startsWith('{')) {
      throw new Error('no telemetry.json at ' + DATA_PATH);
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error('telemetry.json is not valid JSON');
    }
    const bad = validate(json);
    if (bad) throw new Error(`schema: ${bad}`);
    return {
      source: 'file',
      reason: json.meta?.generated_at
        ? `scraped ${json.meta.generated_at}`
        : 'telemetry.json',
      data: {
        ...json,
        series: normaliseSeries(json.series),
        generatedAt: json.meta?.generated_at ?? null,
      },
    };
  } catch (err) {
    return {
      source: 'sim',
      reason: `telemetry.json unavailable (${err.message}) — using simulator`,
      data: null,
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export { POLL_MS };