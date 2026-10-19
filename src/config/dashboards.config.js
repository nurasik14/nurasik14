/* ================================================================ *
 *  dashboards.config.js — the --dashboards telemetry panels
 *
 *  - SCRAPER_JOBS: the live fleet shown by pipeline_monitor.py.
 *    `rate` drives per-tick record increments; statuses evolve on
 *    their own but you can pin a job by giving it any status here.
 *  - LOG_LINES: the rotation pool for the stdout tail.
 *  - RANGES: chart window selectors (n = number of 5-min buckets).
 *  - ANALYTICS_PARAMS: seeds/shape of the generated 24h series.
 *  - RAW_JSON / RAW_CSV / RAW_SCHEMA: the inspector tab contents.
 * ================================================================ */

export const REFRESH_MS = 1600; // dashboard fleet tick interval

export const SCRAPER_JOBS = [
  {
    id: 'job-7f21',
    name: 'arxiv_cs_cl_daily',
    target: 'arxiv.org/list/cs.CL/recent',
    parser: 'lxml + trafilatura',
    cadence: '*/15 * * * *',
    records: 18422,
    rate: 42.1,
    status: 'OK',
    code: 200,
  },
  {
    id: 'job-3a90',
    name: 'hk_geo_price_feed',
    target: 'data.gov.hk/api/v2/feed',
    parser: 'jsonpath + duckdb',
    cadence: '*/5 * * * *',
    records: 96210,
    rate: 118.4,
    status: 'OK',
    code: 200,
  },
  {
    id: 'job-1c4e',
    name: 'kazakh_news_crawl',
    target: 'kaznews.kz/rss/all.xml',
    parser: 'feedparser + langid',
    cadence: '*/30 * * * *',
    records: 12408,
    rate: 17.6,
    status: 'WARN',
    code: 206,
  },
  {
    id: 'job-9d02',
    name: 'hf_model_cards',
    target: 'huggingface.co/api/models',
    parser: 'requests + pydantic v2',
    cadence: '0 * * * *',
    records: 5317,
    rate: 6.2,
    status: 'OK',
    code: 200,
  },
  {
    id: 'job-5b7f',
    name: 'cityu_course_catalog',
    target: 'cityu.edu.hk/catalog',
    parser: 'playwright (js-render)',
    cadence: '0 3 * * *',
    records: 2044,
    rate: 0.9,
    status: 'ERR',
    code: 429,
  },
  {
    id: 'job-0e88',
    name: 'kaggle_leaderboard_snap',
    target: 'kaggle.com/competitions/*/lb',
    parser: 'bs4 + regex table',
    cadence: '0 */6 * * *',
    records: 73301,
    rate: 31.7,
    status: 'OK',
    code: 200,
  },
];

/* rotation pool for the stdout tail — %t is the live timestamp */
export const LOG_LINES = [
  'GET  /api/v2/feed?limit=500 ................ 200 OK   1.18s  1204 rec',
  'GET  arxiv.org/list/cs.CL/recent .......... 200 OK   0.94s   341 rec',
  'GET  kaznews.kz/rss/all.xml ............... 206 PART 2.71s    96 rec',
  'GET  huggingface.co/api/models?sort=likes . 200 OK   0.42s    52 rec',
  'GET  cityu.edu.hk/catalog ................. 429 RATE 0.11s     0 rec',
  'langid: 96 kk / 74 ru / 0 unknown ......... ok',
  'minhash dedup: 7 near-dup dropped (j>0.85)',
  'duckdb: INSERT INTO documents ... 1374 rows',
  'faiss: index rebuild (12408 vec, 57.3MB) .. 812ms',
  'backoff: host=data.gov.hk wait=12.4s (bucket empty)',
  'GET  kaggle.com/competitions/*/lb ......... 200 OK   1.42s   880 rec',
  'parse_error: kaznews.kz item 118 missing <pubDate>',
];

/* Chart window selectors.
   `windowMs` is what the chart actually slices by when real scraper data is
   loaded — keep these three consistent with each other (1h / 6h / 24h).
   `n` is the fallback bucket count for the simulator's 5-minute series. */
export const RANGES = [
  { id: '1H', n: 12, windowMs: 60 * 60 * 1000 },
  { id: '6H', n: 72, windowMs: 6 * 60 * 60 * 1000 },
  { id: '24H', n: 288, windowMs: 24 * 60 * 60 * 1000 },
];

/* shape of the generated 24h analytics series */
export const ANALYTICS_PARAMS = {
  seed: 0xa11ce,
  bucketMs: 5 * 60 * 1000,
  buckets: 288,
  baseRate: 120,
  diurnalAmplitude: 190,
  baseP50: 28,
  baseP95: 61,
  baseQueue: 34,
};

/* records-by-source mix (both the bar chart and the table) */
export const SOURCE_MIX = [
  { src: 'arxiv.org', n: 18422, pct: 22.4, lang: 'en' },
  { src: 'data.gov.hk', n: 96210, pct: 31.1, lang: 'zh/en' },
  { src: 'kaznews.kz', n: 12408, pct: 15.1, lang: 'kk/ru' },
  { src: 'huggingface.co', n: 5317, pct: 6.5, lang: 'en' },
  { src: 'kaggle.com', n: 73301, pct: 23.7, lang: 'en' },
  { src: 'cityu.edu.hk', n: 2044, pct: 1.2, lang: 'en' },
];

/* ---------------- raw inspector tab contents ---------------- */

export const RAW_JSON = `{
  "run_id": "run_2025_11_18_a3f9c21",
  "pipeline": "trilingual_rag_index",
  "commit": "a3f9c21",
  "host": "cityu-node-01",
  "corpus": {
    "documents": 12408,
    "languages": { "kk": 4122, "ru": 5581, "en": 2705 },
    "avg_tokens": 412.4,
    "dedup_jaccard": 0.85,
    "removed_duplicates": 917
  },
  "retriever": {
    "sparse": { "engine": "bm25", "k1": 1.5, "b": 0.75, "index_mb": 38.2 },
    "dense": { "model": "intfloat/multilingual-e5-small", "dim": 384,
               "index": "faiss.flat_ip", "index_mb": 19.1 },
    "fusion": { "method": "weighted_sum", "alpha": 0.55 },
    "reranker": { "model": "cross-encoder/mMiniLMv2-L4", "top_k_in": 100, "top_k_out": 5 }
  },
  "metrics": {
    "recall@5": 0.812, "mrr@5": 0.744, "ndcg@10": 0.769,
    "latency_ms": { "p50": 26.4, "p95": 61.2, "p99": 94.7 }
  },
  "environment": { "python": "3.11.9", "torch": "2.4.1+cpu", "docker": "27.1.1", "os": "ubuntu 22.04" }
}`;

export const RAW_CSV = `run_id,timestamp,job,lang,docs_ingested,parse_errors,p95_ms,status
run_a3f9c21,2025-11-18T14:02:31+08:00,arxiv_cs_cl_daily,en,318,0,58.4,OK
run_a3f9c21,2025-11-18T14:17:22+08:00,arxiv_cs_cl_daily,en,341,2,61.9,OK
run_b17d402,2025-11-18T14:05:09+08:00,hk_geo_price_feed,zh,1204,0,44.1,OK
run_b17d402,2025-11-18T14:10:03+08:00,hk_geo_price_feed,en,1187,0,43.7,OK
run_0c8e11a,2025-11-18T14:32:55+08:00,kazakh_news_crawl,kk,96,0,71.2,WARN
run_0c8e11a,2025-11-18T14:33:41+08:00,kazakh_news_crawl,ru,74,1,88.6,WARN
run_9f0023d,2025-11-18T15:00:00+08:00,hf_model_cards,en,52,0,39.8,OK
run_4ab9912,2025-11-18T03:00:00+08:00,cityu_course_catalog,en,0,18,0.0,ERR
run_4ab9912,2025-11-18T03:04:12+08:00,cityu_course_catalog,en,2044,0,112.4,OK
run_77ee001,2025-11-18T18:00:00+08:00,kaggle_leaderboard_snap,en,880,0,52.3,OK`;

export const RAW_SCHEMA = `-- warehouse schema (duckdb) -----------------------------------------
CREATE TABLE IF NOT EXISTS pipeline_runs (
  run_id        VARCHAR   PRIMARY KEY,
  pipeline      VARCHAR   NOT NULL,
  commit_hash   CHAR(7)   NOT NULL,
  host          VARCHAR   NOT NULL,
  started_at    TIMESTAMP NOT NULL,
  finished_at   TIMESTAMP,
  status        VARCHAR   CHECK (status IN ('OK','WARN','ERR'))
);

CREATE TABLE IF NOT EXISTS documents (
  doc_id        VARCHAR   PRIMARY KEY,
  run_id        VARCHAR   REFERENCES pipeline_runs(run_id),
  lang          CHAR(2)   NOT NULL,
  source        VARCHAR   NOT NULL,
  n_tokens      INTEGER   NOT NULL,
  content_hash  CHAR(16)  NOT NULL,
  chunk_count   SMALLINT  NOT NULL
);

CREATE TABLE IF NOT EXISTS retrieval_eval (
  run_id        VARCHAR   REFERENCES pipeline_runs(run_id),
  mode          VARCHAR   NOT NULL,      -- bm25 | dense | hybrid | rrf
  recall_at_5   DOUBLE    NOT NULL,
  mrr_at_5      DOUBLE    NOT NULL,
  ndcg_at_10    DOUBLE    NOT NULL,
  p95_latency   DOUBLE    NOT NULL,
  PRIMARY KEY (run_id, mode)
);

CREATE INDEX idx_docs_lang     ON documents(lang);
CREATE INDEX idx_docs_hash     ON documents(content_hash);
CREATE INDEX idx_eval_mode     ON retrieval_eval(mode);`;
