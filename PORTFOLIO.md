# nurasik@cityu-node-01 :: systems console

Personal portfolio of **Nurassyl Serikov** — BSc CS @ CityU HK. Built as a live
developer telemetry console (Grafana / Datadog / TUI aesthetic), not a landing page.

![about](screenshots/shot-about.png)

## Run

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # -> dist/
```

Stack: React 19 · Vite · Tailwind CSS 3 · Recharts · framer-motion.

## Maintaining the site

**→ Full guide: [MAINTAINING.md](./MAINTAINING.md)**

Quick map:

| I want to… | Do this |
|---|---|
| add a blog post | append to `POSTS` in `src/config/blog.config.js` |
| add a project | append to `PROJECTS` in `src/config/projects.config.js` |
| change dashboard numbers | edit `src/config/dashboards.config.js`, or switch `MODE` in `src/config/live.config.js` to `'file'` |
| **plug in my own scraper** | `python3 scripts/scraper.py --out public/data/telemetry.json`, set `MODE = 'file'`, commit |
| change bio / stats / links | `src/config/about.config.js`, `src/config/site.config.js` |
| redeploy | `git push` — Actions publishes in ~90s |

The dashboard reads a real scraper's output when one exists. With
`MODE = 'sim'` every curve is generated from a seed; with `MODE = 'file'` it is
read from `public/data/telemetry.json`, and the header badge turns green and
shows the scrape timestamp. If that file is missing or malformed the site falls
back to the simulator and says so — it never renders an empty panel.

## Editing content — everything lives in `src/config/`

No JSX changes are ever needed to update the site. Each file is plain data:

| File | Controls |
|------|----------|
| `site.config.js` | identity, links, nav tabs, top telemetry bar base values, breadcrumb commands, footer |
| `about.config.js` | bio, focus list, operating notes, system profile, stats matrix, stack bars, competitions, timeline, availability |
| `projects.config.js` | the three modules: metadata, spec metrics, links, tags, descriptions |
| `blog.config.js` | syslog posts — `body` is raw markdown (headings, tables, code fences) |
| `rag.config.js` | trilingual corpus slice + gold evaluation queries (qrels) |
| `dashboards.config.js` | scraper jobs, stdout log pool, chart ranges, analytics series shape, raw JSON/CSV/SQL inspector contents |
| `experiments.config.js` | DQN seed/eps/checkpoints, MediaPipe latency model + stage breakdown |

All telemetry curves are generated deterministically from seeds in the config —
change a seed, get a different (but reproducible) run.

## Views

`--about` readme terminal · `--projects` interactive modules (live RAG eval
harness, DQN training replay, pose-to-cursor probe) · `--dashboards` scraper
fleet monitor + analytics + raw output inspector · `--blog` git-log syslog ·
`--contact` channels. Keyboard: press `1–5` to switch.

![projects](screenshots/shot-projects.png)
![dashboards](screenshots/shot-dashboards.png)
