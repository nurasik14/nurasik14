/* ================================================================ *
 *  blog.config.js — the syslog on --blog
 *
 *  Each post: timestamp, commit hash, tags, level, subject, body.
 *  `body` is raw markdown (h2/h3, code fences, tables, lists, quotes).
 * ================================================================ */

export const TAGS = ['#nlp', '#rl', '#scraping', '#pipelines', '#cv', '#systems'];

export const POSTS = [
  {
    id: 'p-001',
    ts: '2025-11-18 14:02:31',
    hash: 'a3f9c21',
    tags: ['#nlp', '#pipelines'],
    level: 'INFO',
    subject: 'hybrid retrieval beats dense-only on the kk-ru-en corpus',
    files: 12,
    body: `## Why the dense-only baseline collapsed

A multilingual encoder is supposed to align languages in one shared space. On paper,
that makes dense retrieval the obvious choice for a trilingual corpus. In practice my
first dense-only run scored **Recall@5 = 0.61** while plain BM25 scored **0.70**.

The failure mode was consistent: agglutinative Kazakh surface forms. A query token like
\`кітапханаларымыздан\` never appears in the index in that exact form, so the sparse
branch misses it — but the dense branch *also* missed it, because the encoder's
subword splitting produced a long tail of low-salience pieces that pulled the vector
away from its Russian and English neighbours.

## The fix

Two changes, in order of impact:

1. **Vocabulary extension.** 24k additional BPE merges trained on the Kazakh side of the
   corpus dropped tokenizer fertility from 3.1 to 1.6 subwords per word. Sequence length
   fell 38%, and — more importantly — the vector stopped being dominated by suffix noise.
2. **Hybrid fusion.** Normalise both score distributions to \`[0,1]\` with min-max over the
   candidate pool, then take a weighted sum. Weight \`alpha = 0.55\` on the dense branch
   came out of a grid sweep.

\`\`\`python
def fuse(sparse, dense, alpha: float = 0.55):
    a = minmax(sparse)          # BM25 is unboundded -> must normalise
    b = minmax(dense)           # cosine is already bounded, but pool-relative
    return alpha * b + (1 - alpha) * a
\`\`\`

## Results

| mode | Recall@5 | MRR@5 | nDCG@10 |
|------|---------|-------|---------|
| bm25 | 0.702 | 0.641 | 0.688 |
| dense | 0.611 | 0.558 | 0.602 |
| hybrid | **0.812** | **0.744** | **0.769** |
| rrf | 0.794 | 0.731 | 0.755 |

The interesting part is that hybrid beats *both* parents by more than the gap between
them. Sparse and dense fail on disjoint query sets: BM25 dies on morphological variance,
dense dies on rare entities and exact numbers. Their errors barely overlap.

## What I'd do next

The reranker is the next bottleneck. A distilled 4-layer MiniLM gets nDCG@10 within 1.4
points of the teacher, but at 34 ms on CPU it is 55% of the retrieval budget. I want to
try late-interaction (ColBERT-style) scoring with a token budget instead.`,
  },
  {
    id: 'p-002',
    ts: '2025-11-02 09:41:07',
    hash: '7d1e8ba',
    tags: ['#rl'],
    level: 'INFO',
    subject: 'reward shaping cut the flappy bird exploration horizon by 6x',
    files: 4,
    body: `## Terminal-only reward is a curse

My first DQN run used the obvious reward: \`+1\` per pipe, \`-10\` on death. After 1,200
episodes the agent was still scoring 3 pipes. The problem is not the network — it is
that the reward signal arrives *once* per 20+ seconds of simulated flapping.

## Shaping

I added a continuous term that penalises vertical distance to the gap centre, and a small
per-step survival bonus:

\`\`\`python
gap_y = pipe.gap_center_y
shaping = -0.1 * abs(bird.y - gap_y) / H   # scaled to [0, 0.1]
reward  = 1.0 if passed_pipe else 0.0
reward += shaping + 0.01                    # survive
reward  = -5.0 if dead else reward
\`\`\`

| config | pipes @ ep400 | pipes @ ep1200 | steps to first clear |
|--------|--------------|----------------|---------------------|
| terminal only | 2 | 9 | 84,000 |
| + distance shaping | 17 | 61 | 13,900 |
| + survival bonus | 21 | 58 | 11,200 |

Shaping got the horizon down roughly 6x. The survival bonus helped early but slightly
*hurt* late training — the agent learned to hover in safe states rather than push through
gaps — so I decay it to zero by episode 600.

## On the loss curve

Huber loss instead of MSE mattered more than I expected. MSE on TD-error produces
gradient spikes whenever the agent hits a novel terminal state; the loss plot has visible
vertical scars after every exploration burst. Huber with \`delta=1.0\` smoothed it enough
that the 100-episode moving average is monotone after episode ~380.

> Prioritised replay is worth it, but only if you anneal the importance-weight exponent.
> Fixed \`beta = 0.4\` kept over-correcting on the exact transitions the buffer had already
> sampled many times.`,
  },
  {
    id: 'p-003',
    ts: '2025-10-21 22:15:53',
    hash: 'c04a5f9',
    tags: ['#scraping', '#pipelines'],
    level: 'WARN',
    subject: 'scraper fleet: 429 storms and how the backoff got rewritten',
    files: 9,
    body: `## Incident

\`job-5b7f\` (cityu_course_catalog) started returning **HTTP 429** on every scheduled run
at 03:00. The old handler treated 429 as a transient error and retried after a fixed
2-second sleep — three times, then gave up. Against a rate limiter with a 60-second
window, three fast retries is indistinguishable from a hammering client, so the ban
extended each night.

## Rewrite

Two changes:

- **Adaptive token bucket per host**, shared across all jobs that target the same origin.
  One limiter per host, not per job — six jobs hitting \`data.gov.hk\` should consume one
  budget, not six.
- **Exponential backoff with jitter and Retry-After respect.** If the response carries
  \`Retry-After\`, honour it exactly; otherwise \`min(300, base * 2**n) * uniform(0.5, 1.5)\`.

\`\`\`python
async def fetch(session, url, host_bucket, attempt=0):
    await host_bucket.acquire()
    async with session.get(url) as r:
        if r.status == 429:
            wait = parse_retry_after(r) or min(300, 2 ** attempt)
            wait *= random.uniform(0.5, 1.5)
            await asyncio.sleep(wait)
            return await fetch(session, url, host_bucket, attempt + 1)
        return r
\`\`\`

## After

| metric | before | after |
|--------|--------|-------|
| 429 responses / day | 1,412 | 37 |
| successful pages / day | 18,220 | 24,905 |
| mean crawl wall-time | 71 min | 52 min |
| banned windows / week | 6 | 0 |

Crawl throughput went *up* after slowing down. Almost all of it is the shared per-host
bucket: previously six jobs were each independently probing the same origin and
collectively tripping the limiter.

## Standing rule

Every job now declares \`rate_limit_group\` in its manifest, and the scheduler refuses to
start a job whose group has no limiter registered. That constraint belongs at
registration time, not at runtime.`,
  },
  {
    id: 'p-004',
    ts: '2025-10-05 17:28:44',
    hash: '1f77c02',
    tags: ['#nlp', '#systems'],
    level: 'INFO',
    subject: 'tokenizer fertility: the metric I now check before training anything',
    files: 3,
    body: `Fertility is just *subword tokens per pre-token word*, but it is the cheapest possible
diagnostic for whether a multilingual model will waste its context window on your
language.

\`\`\`python
def fertility(text, tok):
    words = re.findall(r"\\S+", text)
    ids   = [len(tok.encode(w, add_special_tokens=False)) for w in words]
    return sum(ids) / len(ids)
\`\`\`

Measured on a matched 2,000-sentence sample per language, English-centric BPE vocab:

| language | fertility | seq len p95 | notes |
|----------|-----------|-------------|-------|
| English | 1.24 | 118 | in-vocab |
| Russian | 2.06 | 214 | Cyrillic, mostly 2-3 pieces |
| Kazakh | **3.10** | **341** | suffix chains explode |

After extending the vocab with 24k Kazakh merges:

| language | fertility | seq len p95 |
|----------|-----------|-------------|
| Kazakh | **1.61** | **212** |

That is a 38% context saving, which on a 512-token window is the difference between
fitting 4 retrieved passages and fitting 7.

## The trap

Do not extend the vocab *and* keep the old embedding matrix. New token ids initialised
to zero kill the first few hundred steps of training. I initialise new rows with the mean
of the sub-pieces the merge replaced — converges in about 40 steps instead of 600.`,
  },
  {
    id: 'p-005',
    ts: '2025-09-14 11:09:12',
    hash: 'e29b6d4',
    tags: ['#cv'],
    level: 'INFO',
    subject: 'sub-50ms hands-free cursor: where the latency actually goes',
    files: 6,
    body: `The headline number is 31.4 ms p50, but the breakdown is the part that mattered for
optimisation — I spent two days on the wrong half of the pipeline before measuring.

| stage | p50 | p95 | share |
|-------|-----|-----|-------|
| camera capture (V4L2, mmap) | 4.1 | 7.8 | 13% |
| resize + RGB convert | 2.3 | 3.9 | 7% |
| MediaPipe pose inference | 21.6 | 29.4 | 69% |
| Kalman filter + affine map | 1.2 | 2.1 | 4% |
| OS event injection | 2.2 | 4.6 | 7% |

The obvious target is pose inference, and I did get it from 28 ms to 21 ms by dropping
\`model_complexity\` from 2 to 1 and letting the ROI tracker reuse the previous frame's
crop. But the *real* win was elsewhere: event injection was blocking on a synchronous
X11 round-trip. Batching pointer moves into a single \`XTestFakeMotionEvent\` per frame
and moving click dispatch to a separate thread took p95 from 58 ms to 43.8 ms.

## Jitter, not mean

Users do not perceive 31 ms. They perceive the 90 ms outliers when MediaPipe drops
landmarks for a frame. Holding the last confident pose for up to 90 ms with a linear
extrapolation, then snapping to a dead zone, removed the visible stutter entirely —
the mean barely moved (31.4 → 32.1 ms) but the p99 went from 112 ms to 74 ms.`,
  },
  {
    id: 'p-006',
    ts: '2025-08-30 08:55:01',
    hash: 'b8c31de',
    tags: ['#pipelines', '#systems'],
    level: 'INFO',
    subject: 'minhash dedup: 917 near-duplicate news items were inflating BM25',
    files: 2,
    body: `Kazakh and Russian news sites syndicate aggressively. Before dedup, the corpus had
clusters of 8-20 near-identical articles differing only in byline and timestamp. BM25's
IDF term is computed over document frequency, so a story that appears 15 times looks
*more* central to the collection, not less.

## Setup

\`\`\`python
from datasketch import MinHash, MinHashLSH
m = MinHash(num_perm=128)
for sh in shingles(text, k=5):
    m.update(sh.encode("utf8"))
lsh.insert(doc_id, m)
\`\`\`

Threshold sweep on a manually labelled 400-pair sample:

| Jaccard threshold | pairs kept | precision | recall |
|-------------------|-----------|-----------|--------|
| 0.70 | 1,884 | 0.71 | 0.98 |
| **0.85** | **917** | **0.94** | **0.93** |
| 0.95 | 431 | 0.99 | 0.62 |

0.85 was the knee: below it, precision falls off as genuinely different articles about
the same event start collapsing.

## Downstream effect

| metric | before dedup | after dedup |
|--------|--------------|-------------|
| docs | 13,325 | 12,408 |
| Recall@5 | 0.771 | **0.812** |
| top-1 duplicate rate | 11.4% | 2.1% |

Top-1 duplicate rate — how often the *same* story occupied multiple slots in the top-5 —
was the metric that actually annoyed users. Retrieval scores improved, but the UX
improvement was larger.`,
  },
  {
    id: 'p-007',
    ts: '2025-08-11 19:33:20',
    hash: '5aa0f17',
    tags: ['#systems', '#pipelines'],
    level: 'NOTE',
    subject: 'why every run writes to a JSONL ledger',
    files: 1,
    body: `Ablations are only comparable if the environment is pinned. My harness refuses to run
without all four of: corpus hash, chunker config hash, embedder revision, and top-k.

\`\`\`json
{"run_id":"run_a3f9c21","commit":"a3f9c21","corpus_sha":"9f2c...",
 "chunk":{"size":320,"overlap":48,"strategy":"structure"},
 "embedder":"intfloat/multilingual-e5-small@8f7c2a",
 "top_k":5,"metrics":{"recall@5":0.812,"mrr@5":0.744}}
\`\`\`

Three weeks later I can answer "was that 0.812 before or after the vocab extension?"
without re-running anything. The ledger is append-only, git-tracked, and 41 KB after
118 runs.

> The discipline that matters is not the schema — it is refusing to run an experiment
> that cannot be reproduced. If a field is missing, the run fails loudly at start,
> not silently at analysis time.`,
  },
];
