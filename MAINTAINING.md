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
  public/data/github.json          ← contribution graph data (scripts/profile_stats.py)
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

Add an object to `PROJECTS`. Array order is pin order: every project that is
not `archived` gets a GitHub-style pinned card in `## 01 projects`; archived
ones are listed compactly under the cards. Each has a `details` button that
opens its YAML and results panel.

```js
{
  id: 'recsys',                  // unique; the card opens at #project-recsys
  name: 'train_recommender',     // the card title (links to the repo if there is one)
  status: 'running',             // 'complete' | 'running' | 'archived'
  result: 'in progress; nothing measured yet',  // the card's result: line
  stack: ['python', 'pytorch'],  // dots; names in LANG_COLORS get a filled colour dot
  description: 'One plain sentence about what it does.',
  inputFile: 'config.yaml',      // name shown above the YAML block
  input: {                       // rendered as YAML
    dataset: 'MovieLens-100k',
    repo: 'nurasik14/recsys',    // a `repo` value links the card title and "open repo"
  },
  stats: { empty: 'waiting for the first benchmark', note: 'What will be measured.' },
}
```

`stats` is either a placeholder object like the one above, or the name of a
custom results panel in `src/components/ProjectStats.jsx` (`'dqn'`, `'search'`,
`'rag'`). When a project has real results, add a panel there. `StepChart`
draws "best so far" step charts. Set `defaultOpen: true` on a project whose
details should be open when the page loads (none are by default, so all
pinned cards fit on screen).

## Update the DQN numbers

`DQN_RUNS` holds `[episode, best reward]` pairs copied from the
"new best reward" lines in `FlappyBird-RL/runs/graphs/*.log`. Fig. 1 in the
README.md panel, the figures and the data table in the `train_dqn` details
all read from it. The `train_dqn` `result` line repeats the last Double DQN
point as text, so update it at the same time.

## Bio, links, CV, stack, experience, awards, education

- `PROFILE`: the sidebar and README panel. `name`, `github` (the handle under
  the name), `avatar` (image URL; `monogram` shows if it fails), `status`
  (`"what, when"`: the pill shows it as `what · when`), `bio` (short, sidebar),
  `school`, `degree`, `location`, `focus` (README frontmatter), `intro` (README
  paragraph), email, contact note and links. A link's `prefix` without the
  slash is also its command (`:gh`, `:hf`, `:in`). `handle` is the top bar's
  `~/nurassyl` home link.
- `NOW`: the `### now` list in the README panel. Plain sentences.
- `LANG_COLORS`: linguist colours for the language dots on the cards.
- `TOOLS`: `[name, group]` pairs. `## 04 stack` groups them into a manifest.
- `EXPERIENCE` (grouped by the year `when` starts with), `AWARDS` (the
  sidebar's achievements list and the `## 03 awards` table), `EDUCATION`,
  `LANGUAGES` and `LANG_CODES` (the sidebar shows the codes). Education fields
  are `[key, value, comment?]`; values can be strings, numbers, arrays or flat
  objects.
- CV: the PDF lives at `public/Nurassyl_Serikov_CV.pdf` (file name = `PROFILE.cv`).

Section order and shortcut numbers are set in `SECTIONS` in `src/App.jsx`;
they drive the tab bar, the number keys and the command line.

## Contribution graph

The activity block under the pinned cards reads `public/data/github.json` at
runtime (`login, generated, public_repos, stars, followers,
commits_last_year, contributions_last_year, pull_requests, streak, languages,
days`). `scripts/profile_stats.py` writes it. If the file is missing or
malformed the page shows an error, not numbers, and the sidebar leaves out the
followers line.

## Shell and keyboard shortcuts

Both pages render inside `<AppShell>` (`src/shell/AppShell.jsx`):

| key | does |
|---|---|
| `0`–`5` | jump to a section (`0` overview, `## 01 projects` … `## 05 contact`) |
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

## Profile README stats

The stat cards in `README.md` (`overview.svg`, `languages.svg`,
`activity.svg`) and the contribution snake are not committed to `main`.
`.github/workflows/profile-stats.yml` rebuilds them daily (and on pushes that
change the script or workflow) and force-pushes them to the `output` branch,
which the README links to. To run it by hand: Actions → Profile stats → Run
workflow. To preview locally:

```bash
GITHUB_TOKEN=$(gh auth token) python3 scripts/profile_stats.py --out stats
```

Locally your token also sees private-repo commits, so `commits` can be higher
than what the workflow publishes. Languages skip forks, HTML, CSS and notebooks
(`EXCLUDED_LANGS` in the script).

## README screenshots

`screenshots/*.png` are 1440×900 captures of the running site (phone: 390×844):
`profile.png` (top of index.md), `projects.png` (scrolled to `## 01 projects`),
`planner.png`, `news.png` and `mobile.png`. Capture from a non-loopback address
(e.g. `bun run dev --host 127.0.0.2`) so the planner shows the read-only Pages
view instead of local state, and wait for the avatar and `github.json` to load.

The README shows only `demo.png`: the four desktop shots in a 2×2 grid with the
phone shot at the same total height on the right, resized to 2400px wide.
Rebuild it whenever a screenshot changes. Use one composite image rather than
several `<img>` tags side by side, because images of different heights do not
line up on GitHub.
