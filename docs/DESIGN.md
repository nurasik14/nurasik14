# Design: "Workbench" (v3)

The site is Nurassyl's workbench, presented as one editor session with three
open buffers: `index.md` (the portfolio), `planner.cal` (the planner) and
`news.fm` (spoken news wrap-ups, encrypted).
It should look like a programmer built it with care. That means quiet chrome,
exact alignment, real data and a few precise details. Avoid glow, glass,
gradients, marquees and fake telemetry.

## Thesis

- Visitor: an ML/AI internship recruiter or engineer with 1 to 3 minutes,
  and the owner, who uses the planner daily on localhost.
- Proof artifact: real training curves (`DQN_RUNS`), real repos, real
  awards and the real contribution graph (`public/data/github.json`). The
  README panel shows evidence (fig. 1) instead of a slogan.
- Signature: the **statusline**, a vim-like bar fixed to the bottom. It
  reports actual state: mode (`NORMAL`, `INSERT` while typing, `READONLY` on
  Pages, `SEALED` briefly after a seal, `LOCKED`, `PLAYING` and `PAUSED` on
  news.fm), the current buffer, the current section and scroll position. `:`
  opens the command line, which is the
  command palette rendered as a sheet that rises from the statusline.
- Rejected concepts: (1) the previous "agent run" terminal. It was too close
  to v2 and leaned on tool-call theatre. (2) A light Swiss editorial ledger.
  It read well but lost the programmer identity the owner asked for.

## Tokens (implemented in tailwind.config.js and src/index.css)

| role | token | hex | use |
|---|---|---|---|
| canvas | `bg` | #111316 | page |
| panel | `surface`, `surface-2` | #191c21, #20242a | panels, hovered rows |
| rules | `line-soft`, `line` | #1e2228, #2c3139 | decorative dividers only |
| control border | `line-strong` | #6f767e | inputs, buttons (>=3:1) |
| text | `fg`, `fg-dim`, `fg-faint` | #e8e3d8, #9ba1a8, #7a8189 | body, secondary, meta (all >=4.5:1) |
| signal | `signal` / `signal-ink` | #f0b35a / #1a1206 | cursor, current location, primary action, seal |
| ok | `ok` | #93c47d | complete, done, YAML strings |
| info | `info` | #82aed6 | keys, running, in-code links |
| warn | `warn` | #e8735e | destructive actions, errors |
| data | `heat-0`…`heat-4` | #1e2228 #4a3a20 #7a5a2a #b8853f #f0b35a | contribution-graph cells and legend only |

Rules:
- Amber is scarce. Use it for at most one primary action per view, plus the
  cursor and current-location markers. Never use it as large fills or
  decoration. The `heat-*` ramp is data (the contribution graph), not
  decoration, and is used nowhere else.
- Colour is never the only signal. Status always has a word or glyph next to it.
- Type roles: **Geist** (sans) for prose and the profile name.
  **JetBrains Mono** for code, labels, metadata, dates, nav, the GitHub
  handle, statusline and buttons. Body text is 16px with a 60–68ch measure.
  Labels are 12px mono uppercase with +0.08em tracking (`.label`). The name
  is a profile name, not a display headline: Geist 600, 24px (26px from
  768px), -0.02em tracking, followed by a small amber cursor block.
- Spacing scale: 4/8/12/16/24/40/64. On index.md, sections are separated by
  a 1px `line` rule with 40px of space on each side. Corners have a 4px radius (`rounded`). Shadows
  appear only on real overlays (command line, dialogs).
- Section headings look like markdown: a faint `##`, the shortcut number
  `01` in signal, then the title, e.g. `## 01 projects`. The number is the
  keyboard shortcut.
- Motion: 120–180ms ease-out, only for state changes (disclosure open, seal,
  sheet rise). No entrance animations on scroll. With
  `prefers-reduced-motion`, every motion is replaced by an instant state change.

## Shell (src/shell/)

`<AppShell page="index"|"planner"|"news" sections={[{id,label,key}]}>` renders:

1. **Top bar** (sticky, 48px): `~/nurassyl` home link on the left. Buffer
   tabs are real `<a>` links: `index.md` → `${BASE_URL}`, `planner.cal` →
   `${BASE_URL}planner/`, `news.fm` → `${BASE_URL}news/`, with
   `aria-current="page"` on the active one. On the
   right: a `:` command button with a `Ctrl K` hint, and `cv.pdf ↓`.
2. **Outline rail** (only when `sections` is given and `outline="rail"`, the
   default; ≥1100px): sticky left column listing sections as anchor links.
   The current section has an amber `▌` cursor (IntersectionObserver) and
   `aria-current="location"`. index.md passes `outline="none"` and draws its
   own section tabs instead (see "index.md" below); the shell then puts the
   children straight into the `.wrap` page column.
3. **Statusline** (fixed bottom, 28px, mono 12px). Left: mode block (amber
   background with ink text for NORMAL; ok for INSERT and PLAYING; info for
   READONLY and LOCKED; signal for SEALED and PAUSED), then buffer name, then
   current section. Right:
   message area (`flash` text, auto-clears after 4s, `aria-live="polite"`),
   `utf-8`, scroll `NN%`. Below 640px only the mode, buffer and message show.
   Page content gets bottom padding so the bar never covers it or focus.
4. **Command line** (`:`, `/`, Ctrl/Cmd+K): a modal sheet anchored above
   the statusline with an input prefilled `:`. It filters commands (sections,
   `cv`, `planner`, `index`, `news`, `email` copies the address, `gh`, `hf`, `in`).
   Arrow keys and Enter run a command. Esc closes it and returns focus to the
   opener. Focus is trapped inside the sheet, and it uses `role="dialog"`.
5. Global keys (ignored while typing): `0`–`9` jump to sections (each
   section's `key`; index.md uses `0` for overview and `1`–`6`), `g i`
   goes to index.md, `g p` goes to planner.cal and `g n` goes to news.fm.

Context API (`useShell()`): `{ mode, section, setMode(name|null), flash(text, tone?) }`.
`section` is the section in view (`{ id, label, key }` or null), the same
value the statusline shows.
`setMode(null)` restores the page default. The shell sets `INSERT`
automatically while an input, textarea or select has focus, then restores
the previous mode.

## index.md: a GitHub-style profile

The portfolio buffer reads like a GitHub profile page inside the editor
chrome (top bar, `:` command line, statusline, `## 01` headings, YAML).

- **Layout.** From 1012px: a 296px profile sidebar, 32px gap, and the main
  column. 768–1011px: the same with a 14.5rem sidebar. Below 768px the
  sidebar is a top block. The main column is a CSS container
  (`.profile-main`); its width, not the viewport's, decides the README and
  pinned-card columns.
- **Sidebar** (`ProfileSidebar.jsx`, the page's `h1`). Round avatar (the
  real GitHub avatar, `alt=""`, eager, 260×260; an `NS` monogram on a surface
  circle if it fails), the name, the handle `nurasik14` in mono `fg-dim`, a
  bordered status pill (`●` in ok, then `open to AI/ML internships · summer
  2027`), the short bio, then `cv.pdf ↓` (the one amber action) beside an
  `email` mailto button. Then a meta list with mono keys (`edu`, `loc`,
  `lang`), the `gh/ hf/ in/` links, a followers · stars · repos line (only
  once github.json has loaded), and "achievements": every award as medal
  glyph + word, title, year, with a link to `## 04 awards` for the notes.
  Achievements are hidden below 768px (the awards section has them). The
  sidebar is sticky under the top bar only when it fits the viewport.
- **Tabs** (`ProfileTabs.jsx`, replaces the outline rail here). UnderlineNav
  style, sticky under the top bar: `00 overview`, `01 projects 8`, … each an
  anchor link with `aria-keyshortcuts`, counts in a `surface-2` pill. The
  current section (from `useShell().section`) is `fg` with a 2px amber
  underline, its number in amber, and `aria-current="location"`. Below
  ~1000px the tab list scrolls sideways inside itself and keeps the
  current tab in view; the page never does.
- **00 overview: README.md panel.** A bordered frame with a mono header row
  `nurasik14 / README.md`. Body: the YAML frontmatter (focus, status, based,
  langs), a short intro, a `### now` list, and fig. 1. When the main column
  is at least 48rem, fig. 1 sits in a 20rem column on the right.
- **01 projects.** "pinned": GitHub-style cards, two columns when the main
  column is at least 34rem. Each card: the name in mono `info` (a link to the
  repo when there is one), a bordered status badge (glyph + word), the
  description, `result:` line, stack as dots (filled in the linguist colour
  for languages, hollow for tools) and a `details` disclosure button
  (`aria-expanded`/`aria-controls`). Details (config YAML, results panel,
  open repo) open full width under the card's row: each panel follows its
  card in the DOM and spans the grid, and `grid-auto-flow: dense` lets the
  next card fill the slot beside the open one. Archived projects are a compact
  list under the cards with the same disclosure. `#project-<id>` opens and
  scrolls to a project; opening one writes that hash back.
- **Activity** (`Contributions.jsx`, inside 01 projects, `#activity`).
  "N contributions in the last year" and "as of <generated>", a 53-week
  Sunday-first grid in the `heat-*` shades (quartiles of the non-zero days;
  the busiest day is always `heat-4`), month labels, Mon/Wed/Fri labels, a
  less/more legend, current and longest streak, commits (last year) and pull
  requests (all time), then a language bar and legend. Data is fetched at
  runtime from `${BASE_URL}data/github.json`. While loading, the box says so;
  if the fetch fails, it says what failed and links to the live GitHub graph,
  with no numbers. Cells have `<title>` tooltips; the SVG is hidden from
  screen readers, which get a summary sentence and a per-month table instead.
  If a full year would need cells under 8px, only the most recent weeks that
  fit are drawn, with "last N weeks shown" underneath.
- **02 weekly** (`Weekly.jsx`, data in MAINTAINING.md). `### last 7 days`:
  a meta line with the range and "updated <time> HKT", three figure tiles
  (in the editor, daily average, active days), daily bars (an SVG, hidden from
  screen readers, which get a table instead; `<title>` tooltips on full-height
  hit areas), the category split, then projects and languages as ranked lists
  (time, share, a 3px bar at the share). `### digest`: mono week buttons
  (`aria-pressed`, the selected one outlined on `surface-2`, never amber;
  `in progress` written out for an incomplete week), the highlights, then
  editor, git and last.fm columns (`auto-fit`, 16rem minimum). A repo's latest
  commit subjects sit behind a `▸` disclosure. A failed source is a dashed
  `∅ <source>: no data for this week` box. Categories use `info`, `ok`,
  `fg-dim`, then `line-strong` for "other", always beside a word and a
  percentage; amber and `heat-*` are not used. Grids use
  `repeat(auto-fit, minmax(…))`, so nothing scrolls sideways at 320px.
- **03 experience.** Like GitHub's contribution activity: a year rule, then
  dated rows on a vertical rail with a dot per entry.
- **04 awards** (table with notes, education YAML), **05 stack**, **06
  contact**, and the footer build stamp are unchanged.

## Mobile (<640px)

The top bar shows the home link, the three buffer tabs and the `:` button.
Below 400px the home link shrinks to `~` and the tabs use 6px padding, which is
what fits all three at 320px. No tab is ever hidden. The
outline rail is hidden, and the command line is how you reach sections. The
statusline collapses as described above. On index.md (below 768px) the
profile is a top block: 64px avatar beside the name and handle, then status,
bio, buttons, meta and links. The tab bar follows it, bleeds to the screen
edges and scrolls sideways inside itself. Pinned cards are one column, a
card's status badge wraps under a long name, and the contribution graph
shows the last weeks that fit. On the planner, the calendar
comes first, then the composer, then the log. Calendar cells shrink to
date numbers, and plan bars become 4px lane strips with a list underneath.
On news.fm, an open clip fills the viewport between the top bar and the
statusline, with the wrap-up ledger and settings below it.
Nothing may scroll horizontally except an explicitly labelled code block.

## Honesty rules (inherited from v2, still binding)

- Numbers only appear when a log, repo or certificate backs them. Content
  comes only from `src/config/portfolio.config.js`.
- Every control works. Remove a control rather than fake it.
- Build info in the footer comes from real values: the git short sha and
  build date, injected at build time.

## Shipped notes

Notes from the first build of the shell and the portfolio page (agent A).
The hero and the projects ledger described here were replaced by the GitHub
profile layout above; the notes on the shell, fig. 1 and the build stamp
still hold:

- **Shell layout.** With `sections`, AppShell puts children in the `.wrap`
  page column next to the outline rail (rail 10.5rem + 48px gap at ≥1100px).
  Without `sections`, as on the planner, children control their own width.
  `useShell` is re-exported from `src/shell/context.js`.
- **Modes.** The displayed mode is `SEALED` if a page set it. Otherwise it is
  `INSERT` while a text control (not a checkbox, button or read-only field)
  has focus, and otherwise the page mode (`setMode`, falling back to
  `defaultMode`). The command line's own input does not count as INSERT.
- **Current section.** An IntersectionObserver with a `-56px 0 -40% 0` root
  margin picks the last section in that band. The rail (`▌` and
  `aria-current="location"`) and the statusline (`## 01 projects`) both read it.
- **Command line.** The list sits above the input, so the input stays next to
  the statusline, as in vim. Enter on an unknown command closes the sheet and
  flashes `E492: not an editor command` in warn. Focus goes back to the opener
  first, and then the command runs, so section jumps can take focus.
- **Sections** have `tabIndex=-1`. Number keys and commands scroll to them
  and move focus there, so the next Tab continues from the new position.
- **fig. 1.** The viewBox follows the rendered width, so axis text stays at
  11–12px. Below 420px the direct labels split onto two lines. Double DQN is a
  solid `fg` line and Dueling a dashed `info` line. There is no legend: each
  direct label starts with a solid or dashed swatch, so colour is not needed.
  The y axis runs from -10 so the first checkpoint (-8.7) sits above a
  labelled tick, and the x-axis title has its own row under the tick labels.
  Focus the chart and use ←/→ to step through
  checkpoints, with the readout in an `aria-live` line.
- **Results panels.** The rag panel (kazakh_rag) shows an NDCG@10 / MRR
  table with every cell "not measured"; the only number is the published
  KazQAD baseline it aims to beat.
- **Build stamp.** `src/shell/build.js` reads `VITE_COMMIT` and
  `VITE_BUILT_AT`. They still need to be defined in vite.config.js or CI.

Notes on news.fm (behaviour and limits are in [NEWS.md](NEWS.md)):

- **Modes.** `LOCKED` while the passphrase is needed. `PLAYING` while speaking,
  including the gap between clips. `PAUSED` only after stopping mid-clip. Before
  the first play, the page default shows (`NORMAL`, or `READONLY` on Pages).
  There is no autofocus on the passphrase field, so `LOCKED` is what you see first.
- **Amber.** One action per view: `unlock`, then `play`. When a wrap-up finishes
  and another has unheard clips, `next unheard` takes the amber from `play`. The
  sync panel's buttons are never amber, because it is not the page's main job.
- **Clip card.** Geist 600 headline, script at a 66ch measure, mono label for the
  newsletter and received time (always HKT). While speaking or paused, the current
  sentence is `fg` and the others `fg-dim`. The footer also says `sentence 3/7`, so
  the position is never colour alone.
- **Clip change.** `.anim-clip`, 150ms ease-out fade and rise. The global
  reduced-motion rule makes it instant.
- **Header.** Below `lg` the page header is screen-reader only once a clip is open,
  because the clip owns the viewport. Above that, the player sits next to a 20–23rem
  column with the ledger, as on the planner.
- **Links and bookmarks.** A mono row under the script: `email ↗` and `article ↗` as
  `.link` text with 44 px targets below `lg`, outside the swipe area. `★` next to the clip
  count is `fg` with a label for screen readers, never amber: it marks state, not the
  current location. On localhost the row starts with a small `☆ bookmark` button
  (`aria-pressed`), which follows the rule below for the panel and is never amber either.
- **Text-only is a state, not an error.** Without speech the clips still read, and
  play is disabled with the reason beneath it.
- **Laptop audio (localhost only).** The card's mono line adds `voice · Ava` or
  `voice · device`, so the engine is never a guess. The fallback to speech is silent
  and is not treated as an error. Pages renders none of this. With audio, a clip
  has no highlight before its first cue, or at all if the cues match no sentence: no
  highlight is better than a wrong one. The panel's `make audio` follows the rule above
  and is never amber.
