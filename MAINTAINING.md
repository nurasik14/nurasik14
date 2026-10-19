# Maintaining this site

Everything on the site is data, not markup. This guide is the reference for
changing content. **You never need to edit a `.jsx` file for routine updates.**

- [The 60-second model](#the-60-second-model)
- [Add a blog post](#1-add-a-blog-post)
- [Add a project](#2-add-a-project)
- [Update the dashboard numbers](#3-update-the-dashboard-numbers)
- [Plug in your own scraper](#4-plug-in-your-own-scraper) ← the interesting one
- [Change bio, stats, links](#5-change-bio-stats-links)
- [Deploy](#6-deploy)
- [Config reference](#config-reference)

---

## The 60-second model

```
  src/config/*.js          ← you edit these (plain data, commented)
        ↓
  React components          ← never edited for content changes
        ↓
  pnpm build → dist/        ← Actions pushes this to Pages
```

Push to `main` and the site redeploys in ~90 seconds. There is no database,
no CMS and no admin panel — Git *is* the CMS.

---

## 1. Add a blog post

Edit **`src/config/blog.config.js`** and add an entry to the `POSTS` array.
Copy an existing one and change the fields:

```js
{
  id: 'p-008',                     // unique, any string
  ts: '2025-11-20 09:14:00',       // 'YYYY-MM-DD HH:mm:ss' — note the SPACE, no T
  hash: 'b2c9d10',                 // 7-char hex, any string
  level: 'INFO',                   // INFO | WARN | ERROR  (uppercase)
  tags: ['#nlp', '#pipelines'],    // must exist in TAGS, WITH the leading #
  subject: 'reranking with a 4-layer cross-encoder', // shown collapsed
  files: 12,                       // optional: file count in the row
  body: `## Heading            // raw markdown, shown when expanded
Body text with **bold** and \`inline code\`.

| col | col |
|-----|----|
| a   | b  |

\`\`\`python
def chunk(text, size=512):
    ...
\`\`\`

- lists
- work too

> and block quotes
`,
}
```

New tags go in the `TAGS` array at the **top** of the same file:

```js
export const TAGS = ['#nlp', '#rl', '#scraping', '#pipelines', '#cv', '#systems'];
```

Posts render newest-first as you `ts`-sort them; keep the array ordered so the
newest post is first.

Supported markdown: `## h2`, `### h3`, tables, fenced code blocks, lists,
`> quotes`, `**bold**`, `` `code` ``.

**No rebuild needed to preview** — `pnpm dev` hot-reloads.

---

## 2. Add a project

Edit **`src/config/projects.config.js`** and append to `PROJECTS`. Copy an
existing entry — the shape is:

```js
{
  id: 'MOD-04',                    // display id, e.g. MOD-01
  slug: 'my-thing',                // picks the widget (see below)
  name: 'my_thing',                // mono name in the header
  status: 'ONLINE',                // ONLINE | TRAINED | DEGRADED
  version: 'v0.1.0',
  tagline: 'One-line summary shown under the title.',
  lang: 'Python 3.11 · PyTorch',   // stack line
  runtime: 'cityu-node-01 · cpu:8',
  uptime: '99.9%',
  body: 'Paragraph text for the left column. Markdown-lite is fine.',
  metrics: [{ k: 'CORPUS', v: '12,408 docs' }],   // the spec table
  links: [{ label: '[VIEW_SOURCE]', href: 'https://github.com/…' }],
  tags: ['#nlp', '#pipelines'],
  meta: { v: '0.9.4', kb: 38.2, hits: 0.812, rrf: 0.583 },  // mono block
}
```

### About `slug` — read this before adding an entry

The **interactive panel** is chosen by `slug`, and only three slugs are wired up:

| `slug` | renders | source |
|---|---|---|
| `trilingual-rag` | retrieval eval harness | `src/components/RagHarness.jsx` |
| `dqn-flappy` | training replay | `src/components/DqnPanel.jsx` |
| `handsfree-cursor` | latency probe | `src/components/CursorPanel.jsx` |

A new `slug` with no match is **safe**: the module still renders its title,
metrics and links, and the widget area shows an amber `no widget` hint naming
the missing `WIDGET` entry. It will not white-screen the page.

To give it a real panel:

1. Put `slug: 'my-thing'` on the project entry.
2. Add it to the `WIDGET` map at the top of `src/components/Projects.jsx`:
   ```js
   const WIDGET = {
     'trilingual-rag': { el: <RagHarness />, label: 'eval_harness.py' },
     'dqn-flappy': { el: <DqnPanel />, label: 'train_monitor.py' },
     'handsfree-cursor': { el: <CursorPanel />, label: 'pose_probe.py' },
     'my-thing': { el: <MyWidget />, label: 'my_monitor.py' },   // ← add
   };
   ```
3. Write `src/components/MyWidget.jsx`. Copy the closest existing widget —
   `RagHarness` (BM25/dense/hybrid retrieval with gold labels), `DqnPanel`
   (episode curves + replay slider), `CursorPanel` (latency histogram and
   percentiles). All three read their parameters from `src/config/`.

---

## 3. Update the dashboard numbers

The dashboard has **two data sources**. Pick with one line in
**`src/config/live.config.js`**:

```js
export const MODE = 'sim';  // 'sim' | 'file'
```

| Mode | Where numbers come from | Use when |
|---|---|---|
| `'sim'` (default) | generated locally from seeds in `dashboards.config.js` | demoing, no scraper yet |
| `'file'` | `public/data/telemetry.json`, written by your scraper | you have real data |

In `sim` mode, edit `dashboards.config.js` directly:

- `SCRAPER_JOBS` — the job table. Add/remove/edit rows freely.
- `LOG_LINES` — the stdout tail rotation pool.
- `SOURCE_MIX` — the "records by source" bars and table.
- `ANALYTICS_PARAMS` — shape of the generated chart: `seed` (change it for a
  different but reproducible curve), `baseRate`, `baseP50`, `baseP95`.
- `RANGES` — the `1H / 6H / 24H` selectors (`n` = number of 5-min buckets).
- `RAW_JSON` / `RAW_CSV` / `RAW_SCHEMA` — the raw inspector tabs.

The header badge tells you which mode produced the numbers on screen. It shows
`simulated` in amber unless a scraper file is actually loaded — so you can never
mistake generated data for real.

---

## 4. Plug in your own scraper

### The one constraint you need to know

**GitHub Pages is static hosting.** There is no server, no database and no
cron runtime. So a scraper cannot "push live data to the site" the way a
backend would. The pipeline is:

```
 your scraper (your machine, or a CI job)
        │  writes
        ▼
 public/data/telemetry.json        ← the only contract
        │  git commit + push
        ▼
 GitHub Actions → pnpm build → Pages
```

A visitor sees your numbers on the next deploy. Run the scraper more often and
commit more often to make it feel live. `POLL_MS` in `live.config.js` lets the
page re-read the file without a reload, so with a 5-minute scraper the numbers
drift within one page view.

### Step 1 — run the included scraper

```bash
pip install -r scripts/requirements.txt   # optional: only for the HTTP collectors
python3 scripts/scraper.py --out public/data/telemetry.json
```

It writes a schema-valid file immediately. Out of the box it scrapes arXiv's
cs.CL listing for real; `--series-from my_metrics.csv` feeds it your own
measurements instead of synthetic ones.

### Step 2 — switch the site to read it

```js
// src/config/live.config.js
export const MODE = 'file';
```

Reload. The badge goes green and reads `live · scraped <timestamp>`.

### Step 3 — replace the collectors with your own

`scripts/scraper.py` is ~250 lines and deliberately boring. Replace the
`collect_*` functions:

```python
def collect_my_source() -> dict:
    return {
        "id": "job-mine",
        "name": "my_scraper",
        "target": "example.com/feed",
        "parser": "requests + trafilatura",
        "cadence": "*/30 * * * *",
        "records": 0,     # total documents ingested
        "rate": 0.0,      # records/sec, shown in the table
        "status": "OK",   # OK | WARN | ERR
        "code": 200,      # last HTTP status
    }

def collect_jobs() -> list[dict]:
    return [collect_my_source()]   # whatever you return gets rendered
```

For the chart, either emit `series` yourself or hand the scraper a CSV:

```csv
timestamp,ingested,errors,p50,p95,queue
2025-11-18T14:00:00+08:00,298,1,27.1,58.2,33
2025-11-18T14:05:00+08:00,341,0,28.4,61.9,37
```

```bash
python3 scripts/scraper.py --out public/data/telemetry.json --series-from metrics.csv
```

### The JSON contract

This is everything the site reads. Missing keys are reported by name in the
badge, so a mistake is easy to spot.

```jsonc
{
  "meta": {
    "generated_at": "2025-11-18T14:32:55+08:00",  // shown in the badge
    "run_id": "run_20251118_a3f9c21",
    "host": "cityu-node-01",
    "commit": "a3f9c21",
    "pipeline_version": "1.0.0"
  },
  "jobs": [{
    "id": "job-7f21", "name": "arxiv_cs_cl_daily",
    "target": "arxiv.org/list/cs.CL/recent",
    "parser": "lxml + trafilatura", "cadence": "*/15 * * * *",
    "records": 18422, "rate": 42.1,
    "status": "OK", "code": 200
  }],
  "series": [{                    // oldest -> newest; charts read these keys
    "ts": "2025-11-18T14:30:00+08:00",  // ISO string or epoch ms
    "ingested": 312, "errors": 2,
    "p50": 28.4, "p95": 61.2, "queue": 37
  }],
  "logs": ["GET  /feed?limit=500 ... 200 OK   1.18s  1204 rec"],
  "sourceMix": [{ "src": "arxiv.org", "n": 18422, "pct": 22.4, "lang": "en" }]
}
```

`series[].ts` accepts an ISO string **or** epoch milliseconds, and rows are
sorted for you, so your scraper's ordering does not matter. Any extra keys you
add are preserved and shown in the **Raw inspector** tab — which now renders
your actual `telemetry.json` byte for byte when in `file` mode.

### Failure behaviour

If the file is missing, unparseable or schema-invalid, the site **falls back to
the simulator** and the badge explains why, e.g.
`simulated · no telemetry.json at data/telemetry.json`. It never shows an empty
panel and never throws. Validate before committing:

```bash
python3 -c "import json;d=json.load(open('public/data/telemetry.json'));print(len(d['jobs']),len(d['series']))"
```

### Running it on a schedule

The simplest honest option is a local cron committing on your machine:

```cron
*/15 * * * * cd /path/to/portfolio && python3 scripts/scraper.py --out public/data/telemetry.json && git add public/data/telemetry.json && git commit -m "telemetry: $(date +%H%M)" && git push
```

For a hosted scraper (VPS, GitHub Actions on a `cron:` schedule, or any
container), run the same command and push the result. Be aware that GitHub
Actions disables scheduled workflows on repos with no activity for 60 days.

If you would rather not commit data at all, keep `MODE = 'file'` and point
`DATA_PATH` at an absolute URL instead of a relative one — the loader takes any
URL. That way the scraper can write to object storage and the site fetches it
directly, giving you real-time updates without any commits.

---

## 5. Change bio, stats, links

All plain data, all commented.

| File | What lives there |
|---|---|
| `site.config.js` | name, handle, host, email, GitHub/HF/LinkedIn URLs, nav tabs, top-bar telemetry base values, footer |
| `about.config.js` | the `--about` terminal text, focus list, `system_profile`, `quick_stats` matrix, stack bars, competitions, timeline, availability |
| `projects.config.js` | the project modules |
| `blog.config.js` | every post |
| `rag.config.js` | the trilingual demo corpus + gold evaluation queries |
| `dashboards.config.js` | simulator data: jobs, logs, chart shape, raw tabs |
| `experiments.config.js` | DQN seed/ε/checkpoints, MediaPipe latency model |
| `live.config.js` | data-source switch (`sim` / `file`) |

Also: `tailwind.config.js` holds the palette (`term-green` `#22c55e`,
`term-amber` `#f59e0b`, `term-cyan` `#06b6d4`) and `src/index.css` the base
typography. Change the accent colours there and the whole console follows.

---

## 6. Deploy

```bash
git add -A
git commit -m "content: new blog post on reranking"
git push
```

`.github/workflows/deploy-pages.yml` builds and publishes automatically. Watch
it at **Actions → Deploy portfolio to GitHub Pages**. Live in about 90s at
`https://nurasik14.github.io/nurasik14/`.

Verify locally first:

```bash
pnpm build && pnpm preview
```

> Because the site is served from a sub-path on Pages, `vite.config.js` sets
> `base: '/nurasik14/'`. That also applies to `pnpm dev`, so the local URL is
> **`http://localhost:5173/nurasik14/`**, not `/`. If you rename the repo,
> update `base` and `VITE_BASE_PATH` in the workflow.

---

## Config reference

| File | Controls |
|------|----------|
| `site.config.js` | identity, links, nav, top-bar telemetry, breadcrumbs, footer |
| `about.config.js` | bio, focus, system profile, stats, stack bars, competitions, timeline, availability |
| `projects.config.js` | project modules: metadata, spec tables, links, tags |
| `blog.config.js` | every syslog post + the tag filter list |
| `rag.config.js` | trilingual corpus slice + gold evaluation queries (qrels) |
| `dashboards.config.js` | simulator data: jobs, log pool, chart params, raw tabs |
| `experiments.config.js` | DQN seed/ε/checkpoints, MediaPipe latency model + stage split |
| `live.config.js` | `sim` vs `file`, data path, fetch timeout, poll interval |

Generated data lives in `src/lib/` (`series.js`, `retrieval.js`, `rand.js`) —
deterministic from seeds, so the same config always renders the same curves.