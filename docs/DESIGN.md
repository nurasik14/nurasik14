# Design: "Workbench" (v3)

The site is Nurassyl's workbench, presented as one editor session with two
open buffers: `index.md` (the portfolio) and `planner.cal` (the planner).
It should look like a programmer built it with care. That means quiet chrome,
exact alignment, real data and a few precise details. Avoid glow, glass,
gradients, marquees and fake telemetry.

## Thesis

- Visitor: an ML/AI internship recruiter or engineer with 1 to 3 minutes,
  and the owner, who uses the planner daily on localhost.
- Proof artifact: real training curves (`DQN_RUNS`), real repos and real
  awards. The hero shows evidence (fig. 1) instead of a slogan.
- Signature: the **statusline**, a vim-like bar fixed to the bottom. It
  reports actual state: mode (`NORMAL`, `INSERT` while typing, `READONLY` on
  Pages, `SEALED` briefly after a seal), the current buffer, the current
  section and scroll position. `:` opens the command line, which is the
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

Rules:
- Amber is scarce. Use it for at most one primary action per view, plus the
  cursor and current-location markers. Never use it as large fills or
  decoration.
- Colour is never the only signal. Status always has a word or glyph next to it.
- Type roles: **Geist** (sans) for prose and the display name.
  **JetBrains Mono** for code, labels, metadata, dates, nav, statusline and
  buttons. Body text is 16px with a 60–68ch measure. Labels are 12px mono
  uppercase with +0.08em tracking (`.label`). The display name uses
  clamp(2.75rem, 7vw, 5.5rem), Geist 600, with -0.04em tracking.
- Spacing scale: 4/8/12/16/24/40/64. Sections are separated by a 1px `line`
  rule plus 64px of space. Corners have a 4px radius (`rounded`). Shadows
  appear only on real overlays (command line, dialogs).
- Section headings look like markdown: a faint `##`, the shortcut number
  `01` in signal, then the title, e.g. `## 01 projects`. The number is the
  keyboard shortcut.
- Motion: 120–180ms ease-out, only for state changes (disclosure open, seal,
  sheet rise). No entrance animations on scroll. With
  `prefers-reduced-motion`, every motion is replaced by an instant state change.

## Shell (src/shell/)

`<AppShell page="index"|"planner" sections={[{id,label,key}]}>` renders:

1. **Top bar** (sticky, 48px): `~/nurassyl` home link on the left. Buffer
   tabs are real `<a>` links: `index.md` → `${BASE_URL}`, `planner.cal` →
   `${BASE_URL}planner/`, with `aria-current="page"` on the active one. On the
   right: a `:` command button with a `Ctrl K` hint, and `cv.pdf ↓`.
2. **Outline rail** (only when `sections` is given, ≥1100px): sticky
   left column listing sections as anchor links. The current section has an
   amber `▌` cursor (IntersectionObserver) and `aria-current="location"`.
3. **Statusline** (fixed bottom, 28px, mono 12px). Left: mode block (amber
   background with ink text for NORMAL; ok for INSERT; info for READONLY;
   signal for SEALED), then buffer name, then current section. Right:
   message area (`flash` text, auto-clears after 4s, `aria-live="polite"`),
   `utf-8`, scroll `NN%`. Below 640px only the mode, buffer and message show.
   Page content gets bottom padding so the bar never covers it or focus.
4. **Command line** (`:`, `/`, Ctrl/Cmd+K): a modal sheet anchored above
   the statusline with an input prefilled `:`. It filters commands (sections,
   `cv`, `planner`, `index`, `email` copies the address, `gh`, `hf`, `in`).
   Arrow keys and Enter run a command. Esc closes it and returns focus to the
   opener. Focus is trapped inside the sheet, and it uses `role="dialog"`.
5. Global keys (ignored while typing): `1`–`9` jump to sections, `g i`
   goes to index.md and `g p` goes to planner.cal.

Context API (`useShell()`): `{ mode, setMode(name|null), flash(text, tone?) }`.
`setMode(null)` restores the page default. The shell sets `INSERT`
automatically while an input, textarea or select has focus, then restores
the previous mode.

## Mobile (<640px)

The top bar shows the home link, the two buffer tabs and the `:` button. The
outline rail is hidden, and the command line is how you reach sections. The
statusline collapses as described above. In the hero, the frontmatter block
comes before the name, and fig. 1 sits below the lede at full width. Project
rows stack their metadata under the title. On the planner, the calendar
comes first, then the composer, then the log. Calendar cells shrink to
date numbers, and plan bars become 4px lane strips with a list underneath.
Nothing may scroll horizontally except an explicitly labelled code block.

## Honesty rules (inherited from v2, still binding)

- Numbers only appear when a log, repo or certificate backs them. Content
  comes only from `src/config/portfolio.config.js`.
- Every control works. Remove a control rather than fake it.
- Build info in the footer comes from real values: the git short sha and
  build date, injected at build time.
