# Maintaining this site

All content is in **`src/config/portfolio.config.js`**. For routine updates you
never need to edit a `.jsx` file.

One rule keeps the page credible: **only add a number if a log, repo or
certificate backs it.** Unmeasured work gets an empty stats panel, not a guess.

```
  src/config/portfolio.config.js   ← you edit this (plain data, commented)
        ↓
  src/components/*.jsx             ← render it
        ↓
  pnpm build → dist/               ← GitHub Actions publishes this to Pages
```

---

## Add or update a project

Add an object to `PROJECTS`. Each one renders as a `ToolCallVisualizer` card:

```js
{
  id: 'recsys',                 // unique; also the #anchor
  name: 'train_recommender',    // shown as the function name
  status: 'running',            // 'complete' | 'running' | 'archived'
  description: 'One plain sentence about what it does.',
  inputFile: 'config.yaml',     // optional label above the Input panel
  input: {                      // first entry becomes the signature: name(key=value)
    dataset: 'MovieLens-100k',
    repo: 'nurasik14/recsys',    // a `repo` value is linked to GitHub
  },
  stats: { empty: 'waiting for the first benchmark', note: 'What will be measured.' },
}
```

`stats` is either a placeholder object like the one above, or the name of a
custom stats panel in `src/components/ProjectStats.jsx` (`'dqn'`, `'search'`,
`'rag'`). When a project has real results, add a panel there; `StepChart`
draws step charts for "best so far" style logs.

## Update the DQN numbers

`DQN_RUNS` holds `[episode, best reward]` pairs copied from the
"new best reward" lines in `FlappyBird-RL/runs/graphs/*.log`. The hero
sparkline, the chart and the figures above it all read from it.

## Change the hero agent run

`AGENT_RUN.steps` lists the tool calls shown in the hero. `out` can be a
string, an array or a flat object; `spark: true` adds the DQN sparkline.

## Bio, links, CV, stack, experience, awards, education

`PROFILE`, `TOOLS` (the scrolling LogoLoop strip), `EXPERIENCE`, `AWARDS`,
`EDUCATION` and `LANGUAGES`. To make the "Download CV" button work, put the PDF
at `public/Nurassyl_Serikov_CV.pdf` (the file name is `PROFILE.cv`).

## Keyboard shortcuts

`1`–`4` jump to sections, `/` or `Ctrl/Cmd + K` opens the jump menu. Sections
live in `src/lib/nav.js`; palette commands in `src/components/CommandPalette.jsx`.

---

## Deploy

```bash
pnpm build && pnpm preview   # check locally first
git add -A && git commit -m "content: ..." && git push
```

`.github/workflows/deploy-pages.yml` builds and publishes on every push to
`main`. Live in about 90 s at `https://nurasik14.github.io/nurasik14/`.

> The site is served from a sub-path on Pages, so `vite.config.js` sets
> `base: '/nurasik14/'`. That also applies to `pnpm dev`: the local URL is
> **`http://localhost:5173/nurasik14/`**, not `/`. If you rename the repo,
> update `base` and `VITE_BASE_PATH` in the workflow.
