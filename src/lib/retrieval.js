/* ------------------------------------------------------------------ *
 * retrieval.js — a compact, dependency-free re-implementation of the
 * sparse / dense / hybrid stack used by the trilingual RAG harness.
 * Everything runs client-side and deterministically so the numbers in
 * the widget are reproducible across sessions.
 * ------------------------------------------------------------------ */

const D = 128; // embedding width
const K1 = 1.5;
const B = 0.75;

export const tokenize = (text) =>
  (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((t) => t.length > 1);

// crude stemmer: aggressive prefix truncation works well enough for
// agglutinative morphology where suffixes carry the variance.
const stem = (t) => (t.length > 6 ? t.slice(0, 5) : t.slice(0, 4));

// cross-lingual alignment groups — stands in for what a multilingual
// sentence encoder learns from parallel data.
const ALIGN = [
  ['морфо', 'morph', 'морфолог'], // morphology
  ['retrie', 'ретрив', 'поиск', 'search', 'ізде'], // retrieval / search
  ['evalu', 'оценк', 'бағала', 'metric', 'метрик'], // evaluation
  ['chunk', 'чанк', 'fragment', 'бөлшек'], // chunking
  ['token', 'токен', 'токениз'], // tokenizer
  ['laten', 'латент', 'задерж', 'жылдам'], // latency
  ['hybri', 'гибрид', 'аралас'], // hybrid
  ['corpu', 'корпус', 'корпус'], // corpus
  ['казах', 'қазақ', 'kazak'], // kazakh
  ['gener', 'генер', 'жасау'], // generation
  ['reran', 'реранк', 'қайта'], // rerank
  ['embed', 'эмбед', 'вектор', 'vector'], // embeddings
  ['index', 'индекс', 'faiss'], // indexing
  ['dedupl', 'дедуп', 'minhash'], // dedup
  [' transl', 'аудар', 'перево', 'translate'], // translation
];
const ALIGN_OF = new Map();
ALIGN.forEach((group, gi) => group.forEach((s) => ALIGN_OF.set(s, gi)));

function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function embed(tokens) {
  const v = new Float64Array(D);
  for (const t of tokens) {
    v[fnv(t) % 64] += 1;
    const gi = ALIGN_OF.get(stem(t));
    if (gi !== undefined) v[64 + (gi % 32)] += 1.6;
    const padded = `$${t}$`;
    for (let i = 0; i < padded.length - 2; i++) {
      v[fnv(padded.slice(i, i + 3)) % 64] += 0.55;
    }
  }
  let n = 0;
  for (let i = 0; i < D; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < D; i++) v[i] /= n;
  return v;
}

export function buildIndex(corpus) {
  const docs = corpus.map((d) => {
    const tokens = tokenize(`${d.title} ${d.text}`);
    const tf = new Map();
    tokens.forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));
    return { ...d, tokens, tf, dl: tokens.length, vec: embed(tokens) };
  });
  const df = new Map();
  docs.forEach((d) => new Set(d.tokens).forEach((t) => df.set(t, (df.get(t) || 0) + 1)));
  const avgdl = docs.reduce((s, d) => s + d.dl, 0) / docs.length;
  return { docs, df, avgdl, N: docs.length };
}

const idf = (index, t) => {
  const n = index.df.get(t) || 0;
  return Math.log(1 + (index.N - n + 0.5) / (n + 0.5));
};

function bm25(index, qTokens) {
  return index.docs.map((d) => {
    let s = 0;
    for (const t of qTokens) {
      const f = d.tf.get(t);
      if (!f) continue;
      s += idf(index, t) * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.dl) / index.avgdl)));
    }
    return s;
  });
}

function dense(index, qTokens) {
  const qv = embed(qTokens);
  return index.docs.map((d) => {
    let s = 0;
    for (let i = 0; i < D; i++) s += qv[i] * d.vec[i];
    return s;
  });
}

const minmax = (arr) => {
  const lo = Math.min(...arr);
  const hi = Math.max(...arr);
  const span = hi - lo || 1;
  return arr.map((x) => (x - lo) / span);
};

const rank = (scores) =>
  scores
    .map((s, i) => [i, s])
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([i]) => i);

/**
 * mode: 'bm25' | 'dense' | 'hybrid' | 'rrf'
 * alpha: weight on the dense branch when mode === 'hybrid'
 */
export function search(index, query, { mode = 'hybrid', alpha = 0.55, topK = 5 } = {}) {
  const q = tokenize(query);
  const sparse = bm25(index, q);
  const sem = dense(index, q);

  let fused;
  if (mode === 'bm25') fused = sparse.slice();
  else if (mode === 'dense') fused = sem.slice();
  else if (mode === 'hybrid') {
    const a = minmax(sparse);
    const b = minmax(sem);
    fused = a.map((v, i) => alpha * b[i] + (1 - alpha) * v);
  } else {
    const rs = rank(sparse);
    const rd = rank(sem);
    const k = 60;
    fused = index.docs.map((_, i) => 1 / (k + rs.indexOf(i)) + 1 / (k + rd.indexOf(i)));
  }

  const order = rank(fused);
  const results = order.slice(0, topK).map((i, r) => ({
    doc: index.docs[i],
    rank: r + 1,
    sparse: sparse[i],
    dense: sem[i],
    fused: fused[i],
  }));

  return { results, sparse, dense, order };
}

export function evaluate(results, gold, k = 5) {
  const rel = new Set(gold);
  const hits = results.filter((r) => rel.has(r.doc.id));
  const recall = hits.length / Math.max(rel.size, 1);
  const first = results.findIndex((r) => rel.has(r.doc.id));
  const mrr = first === -1 ? 0 : 1 / (first + 1);
  let dcg = 0;
  let idcg = 0;
  results.forEach((r, i) => {
    if (rel.has(r.doc.id)) dcg += 1 / Math.log2(i + 2);
  });
  for (let i = 0; i < Math.min(rel.size, k); i++) idcg += 1 / Math.log2(i + 2);
  return {
    recall: +recall.toFixed(3),
    mrr: +mrr.toFixed(3),
    ndcg: idcg ? +(dcg / idcg).toFixed(3) : 0,
    hits: hits.length,
    goldTotal: rel.size,
  };
}

// Deterministic pseudo-latency model, calibrated to the CPU profile of
// the deployed service (see ru-008: bm25 6ms, dense 21ms, rerank 34ms).
export function latencyFor(mode, qLen, seed) {
  const base = { bm25: 6.2, dense: 20.8, hybrid: 26.4, rrf: 27.9 }[mode] ?? 20;
  const jitter = ((fnv(`${mode}${qLen}${seed}`) % 100) / 100) * 3.4;
  return +(base + qLen * 0.42 + jitter).toFixed(1);
}

/* ------------------------------------------------------------------ *
 * Batch ablation: the numbers behind the "ABLATION" table on the
 * RAG module. Computed once at mount from the live index.
 * ------------------------------------------------------------------ */
export function ablate(index, queries, k = 5) {
  const modes = ['bm25', 'dense', 'hybrid', 'rrf'];
  return modes.map((mode) => {
    let recall = 0;
    let mrr = 0;
    let ndcg = 0;
    for (const p of queries) {
      const { results } = search(index, p.q, { mode, topK: k });
      const m = evaluate(results, p.gold, k);
      recall += m.recall;
      mrr += m.mrr;
      ndcg += m.ndcg;
    }
    const n = queries.length;
    return {
      mode,
      recall: +(recall / n).toFixed(3),
      mrr: +(mrr / n).toFixed(3),
      ndcg: +(ndcg / n).toFixed(3),
    };
  });
}
