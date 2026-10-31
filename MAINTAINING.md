# Maintaining this site

All portfolio content is in **`src/config/portfolio.config.js`**. For routine
updates you never need to edit a `.jsx` file.

One rule keeps the page credible: **only add a number if a log, repo or
certificate backs it.** Unmeasured work gets an honest empty state, not a guess.

```
  src/config/portfolio.config.js   ← you edit this (plain data, commented)
        ↓
  src/components/*.jsx             ← render it (index.md, the portfolio)
  src/shell/*                      ← top bar, outline, statusline, command line
        ↓
  bun run build → dist/            ← GitHub Actions publishes this to Pages
```

The visual rules (tokens, type, spacing, the shell) are in
[docs/DESIGN.md](./docs/DESIGN.md). The planner has its own notes in
`docs/PLANNER.md`.

---

## Run it

```bash
bun install
bun run dev        # http://localhost:5173/   planner at /planner/
bun run build      # production build into dist/
bun run preview    # serve dist/ locally
bun run lint       # oxlint
```

## Add or update a project

Add an object to `PROJECTS`. Each one is a row in the `## 01 projects` ledger:

```js
{
  id: 'recsys',                  // unique; the row opens at #project-recsys
  name: 'train_recommender',     // shown in the name column
  status: 'running',             // 'complete' | 'running' | 'archived'
  result: 'in progress; nothing measured yet',  // one line on the collapsed row
  stack: ['pytorch'],            // optional; falls back to input.stack
  description: 'One plain sentence about what it does.',
  inputFile: 'config.yaml',      // name shown above the YAML block
  input: {                       // rendered as YAML
    dataset: 'MovieLens-100k',
    repo: 'nurasik14/recsys',    // a `repo` value becomes the row's GitHub link
  },
  stats: { empty: 'waiting for the first benchmark', note: 'What will be measured.' },
}
```

`stats` is either a placeholder object like the one above, or the name of a
custom results panel in `src/components/ProjectStats.jsx` (`'dqn'`, `'search'`,
`'rag'`). When a project has real results, add a panel there. `StepChart`
draws "best so far" step charts. Set `defaultOpen: true` on the project that
should be expanded when the page loads.

## Update the DQN numbers

`DQN_RUNS` holds `[episode, best reward]` pairs copied from the
"new best reward" lines in `FlappyBird-RL/runs/graphs/*.log`. Fig. 1 in the
hero, the figures and the data table in the `train_dqn` row all read from it.
The `train_dqn` `result` line repeats the last Double DQN point as text, so
update it at the same time.

## Bio, links, CV, stack, experience, awards, education

- `PROFILE`: name, role, status, focus (these make up the hero frontmatter),
  the lede, email, contact note and links. A link's `prefix` without the slash
  is also its command (`:gh`, `:hf`, `:in`).
- `TOOLS`: `[name, group]` pairs. `## 04 stack` groups them into a manifest.
- `EXPERIENCE`, `AWARDS`, `EDUCATION`, `LANGUAGES`. Education fields are
  `[key, value, comment?]`; values can be strings, numbers, arrays or flat objects.
- CV: the PDF lives at `public/Nurassyl_Serikov_CV.pdf` (file name = `PROFILE.cv`).

Section order and shortcut numbers are set in `SECTIONS` in `src/App.jsx`.

## Shell and keyboard shortcuts

Both pages render inside `<AppShell>` (`src/shell/AppShell.jsx`):

| key | does |
|---|---|
| `1`–`5` | jump to a section (`## 01 projects` … `## 05 contact`) |
| `:` or `/` or `Ctrl/Cmd K` | open the command line |
| `g i` / `g p` | go to `index.md` / `planner.cal` |
| `↑` `↓` `Enter` / `Esc` | in the command line: pick and run / close |

Commands: every section, `:index`, `:planner`, `:cv`, `:email` (copies the
address and reports `yanked email`), `:gh`, `:hf`, `:in`. Shortcuts are ignored
while you type in a field, and the statusline then shows `INSERT`.

Pages talk to the shell with `useShell()`: `setMode('READONLY' | 'SEALED' | …)`,
`setMode(null)` to restore the default, and `flash(text, tone)` for a 4 s
message in the statusline.

The footer shows the build's git sha and date, read from `VITE_COMMIT` and
`VITE_BUILT_AT` at build time. Without them it says `dev`.

---

## Deploy

```bash
bun run build && bun run preview   # check locally first
git add -A && git commit -m "content: ..." && git push
```

`.github/workflows/deploy-pages.yml` builds and publishes on every push to
`main`. The base path is worked out from the repository name: a project repo
is served from `/<repo>/` and a `<user>.github.io` repo from `/`. Renaming
or forking needs no edits. Locally the site is always at `/`.
