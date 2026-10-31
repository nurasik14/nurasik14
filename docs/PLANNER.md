# planner.cal

A calendar planner with local persistence. Write a plan, pick a date range,
**seal** it. The plan is saved to `public/data/plans.json` on this machine.
After you commit and push that file, the GitHub Pages copy of the site shows it read-only.

## How it works

```
 your machine (bun run dev / bun run preview)          GitHub Pages
 ─────────────────────────────────────────────         ─────────────────────────────
 browser ── GET/POST/PATCH/DELETE …/api/plans           browser
    │                                                      │ (not loopback: no API probe)
    ▼                                                      │ GET …/data/plans.json
 plugins/planner-api.js (Vite middleware,                  ▼
 loopback clients only)                                 dist/data/plans.json
    │  validate · seal (sha256) · atomic write             ▲  (static copy, read-only)
    ▼                                                      │
 public/data/plans.json ── git add/commit/push ──► CI: vite build copies public/ → dist/
```

On load the page checks `location.hostname`. On anything other than a loopback
host (`localhost`, `127.0.0.1`, `::1`), such as GitHub Pages or a LAN address,
it skips the API and goes straight to `BASE_URL + "data/plans.json"` in mode
`pages · read-only`, so Pages never logs a 404. On loopback it asks for
`BASE_URL + "api/plans"`:

- **200 with `writable: true`** → mode `local · rw`. You can seal plans, tick
  tasks and break seals.
- **anything else** (e.g. a plain static server with no API) → it fetches
  `BASE_URL + "data/plans.json"` and shows mode `pages · read-only`.
- **both fail** → error state with a retry button. If the API reports that
  the file is malformed, the page shows that error and does not fall back.

The API only exists in `vite` and `vite preview`. The static build has
no server; on Pages the hostname alone tells the page it is read-only.

## Using it

1. `bun run dev` and open `http://localhost:5173/planner/`.
2. Click a start day and then an end day on the calendar. You can also type
   the dates into the two date fields, which stay in sync with the calendar.
   Clicking a day before the start swaps the two. Click the start day again for a one-day plan.
   `Esc` clears the selection.
3. Write a title and tasks, one per line (`- [ ] `, `- ` and `* ` prefixes are
   stripped). Notes and a tag are optional.
4. Press **seal** or `Ctrl Enter`. The form collapses to
   `sealed 3f2a9c1 · title · Nov 3 → Nov 9 · 4 tasks`. The statusline shows
   `SEALED` and the new plan is selected.
5. To publish:

   ```sh
   git add public/data/plans.json public/data/google-events.json && git commit -m "plans: update" && git push
   ```

Calendar keys (the grid uses a roving tab stop, so Tab enters it once):
arrows move by day/week, `Home`/`End` go to the week edges, `PageUp`/`PageDown`
move a month (`Shift` for a year), `Enter`/`Space` picks a day. In read-only mode a pick
selects the first plan on that day. The month is kept in the URL as `?m=YYYY-MM`.
`#plan-<id>` deep-links to a plan.

Sealed content (title, notes, tag, tasks, dates) is **immutable**. Only the
done-state of each task can change. To change a plan, break its seal (delete:
click once to arm, a second time to confirm) and seal a new one.

## Data format

`public/data/plans.json`, pretty-printed with 2 spaces, sorted by `start` then
`sealedAt`, with a trailing newline:

```json
{
  "version": 1,
  "plans": [
    {
      "id": "3f2a9c1d04",
      "hash": "3f2a9c1d04…64 hex chars",
      "title": "Ship planner",
      "notes": "",
      "tag": "web",
      "start": "2025-11-03",
      "end": "2025-11-09",
      "sealedAt": "2025-11-01T10:00:00.000Z",
      "tasks": [{ "text": "api", "done": true, "doneAt": "2025-11-04T09:12:00.000Z" }]
    }
  ]
}
```

- `hash` is the sha256 hex of the canonical JSON (keys sorted at every level,
  no whitespace) of `{title, notes, tag, tasks: [texts], start, end, sealedAt}`.
  `id` is `hash.slice(0, 10)`. Done-state is not part of the seal, so ticking
  tasks never changes the hash. The detail panel recomputes the hash in the
  browser and shows `✓ hash matches content`, or `✗` if the file was hand-edited.
- Dates are local calendar dates (`YYYY-MM-DD`), not timestamps. `sealedAt`
  and `doneAt` are UTC ISO timestamps.

## API

Routes match on the path suffix, so they work under any base path. The query string is ignored.

| method | path | body | result |
|---|---|---|---|
| GET | `…/api/plans` | | `200 {version, plans, writable: true, file}` |
| POST | `…/api/plans` | `{title, notes?, tasks: [string], start, end, tag?}` | `201` sealed plan |
| PATCH | `…/api/plans/:id` | `{task: index, done: boolean}` | `200` plan |
| DELETE | `…/api/plans/:id` | | `204` |

Validation errors return `400 {error, field}`. The rules:

- title: 1–120 chars after trimming
- dates: real calendar dates, start ≤ end, range ≤ 366 days
- tasks: 1–50 non-empty lines, each ≤ 200 chars
- notes: ≤ 2000 chars
- tag: ≤ 24 chars of `[a-z0-9-]`

Other errors: `413` for a body over 64 KB, `415` when a write is not `Content-Type: application/json`, `404` for an
unknown id, `405` for a wrong method, `403` for non-loopback clients, and `500` when the
file is malformed.

Writes go through one promise queue. Each write goes to `plans.json.tmp`,
which is then renamed over `plans.json`, so the file is never half-written.
A malformed file is **never overwritten**. Fix it by hand or run `git checkout public/data/plans.json`.

The pure logic lives in `plugins/planner-core.js` (validation, canonical
JSON, hashing, sorting) and `src/planner/dates.js` (local-date helpers). The
client and the server share both. Tests: `bun test tests/`.

## Privacy

Everything you push is **public**: titles, notes, tasks, tags, timestamps. The
repository and the Pages site are world-readable, and git history keeps a
plan even after you break its seal. Keep anything private out of plans you
intend to push, or don't push `plans.json`.

<a id="google"></a>

## Google Calendar

Two-way sync with Google Calendar, for the owner on localhost only. It is
**manual**: nothing talks to Google until you press `sync` (or run `:sync` in
the command line). One sync does a pull and then a push and reports
`synced · pulled 37 · pushed +2 ~1 −0` in the statusline (`~` counts updated
and restored events).

- **Pull.** For each calendar ticked under "pull from", events from 60 days ago
  to 365 days ahead are written to `public/data/google-events.json`. That file
  is committed and pushed with the plans, so Pages draws the same events,
  dashed and muted, next to the sealed plans.
- **Push.** Every sealed plan becomes an all-day, free (transparent) event on a
  dedicated secondary calendar named **planner.cal**, created on the first
  sync. Sync never writes to any other calendar. The event id is the plan's
  sha256, so a sync is idempotent. A broken seal deletes its event. If an
  event was edited or deleted in Google, the next sync puts it back, because
  sealed plans are the source of truth. Events you add to planner.cal by hand
  are left alone and counted.

```
 your machine                                      Google                     GitHub Pages
 ───────────────────────────────────────────       ───────────────────        ──────────────
 planner page ── sync ──► …/api/google/sync
                           │ pull: events.list ◄─── your calendars (read-only)
                           ▼
           public/data/google-events.json  (minimal, see below)
                           │ push: insert/update/delete ──► planner.cal (app-created)
                           ▲
           public/data/plans.json (read only)
 git add/commit/push ───────────────────────────────────────────────────────► data/*.json
```

### What is published

Each pulled event becomes exactly this record:

```json
{ "id": "3f2a9c1d04ab", "title": "CS1102 lecture", "calendar": "Lectures", "color": 0,
  "allDay": false, "start": "2026-11-02T10:00:00+08:00", "end": "2026-11-02T11:50:00+08:00",
  "days": ["2026-11-02"] }
```

- `title` is the full title. Events marked **private** or **confidential** in
  Google are published as `busy`.
- `start`/`end` are `YYYY-MM-DD` with an inclusive end for all-day events, or
  date-times with your offset. `days` lists the local days a timed event
  touches (in the server's time zone, so Pages shows the same days).
- `calendar` is the calendar's display name. A name that looks like an email
  address (Google names your primary calendar after your address) is
  published as `primary` (or `calendar N`).
- `id` is the first 12 hex characters of sha256(calendarId + eventId), which
  reveals neither of them.
- Cancelled events, events you declined and working-location entries are
  skipped.

**Never published:** descriptions, locations, attendees, organizer and creator
emails, conference/Meet links, `htmlLink` and calendar ids. Sync asks Google
only for the fields it needs, so most of these never even reach your machine.
The account email and the calendar list are shown on the local page only.

If a selected calendar fails to load, the file is **not** rewritten. A partial
pull would quietly drop a calendar from the site.

### Secrets

Secrets live outside the repo, in `~/.config/planner-cal/`. Set
`PLANNER_CAL_HOME` to use a different directory. The dev server refuses to
start if that directory is inside the project.

| file | written by | contents |
|---|---|---|
| `client_secret.json` | you | the OAuth client (Desktop app) |
| `token.json` | connect | refresh and access token (mode 0600) |
| `settings.json` | the page | selected calendar ids, planner.cal id, last sync (mode 0600) |

The directory is kept at mode 0700. Tokens never appear in a URL, a response
or a log line.

Scopes are least privilege, and the list lives in `SCOPES` in
`plugins/google-core.js`:

- `calendar.app.created`: create planner.cal and manage events on calendars
  this app created, and only those.
- `calendar.calendarlist.readonly`: list your calendars for "pull from".
- `calendar.events.readonly`: read events from the calendars you tick.

### One-time setup

1. In the [Google Cloud console](https://console.cloud.google.com/), create a
   project (e.g. `planner-cal`).
2. **APIs & Services → Library**: enable **Google Calendar API**.
3. **OAuth consent screen** (Google Auth Platform): user type **External**,
   publishing status **Testing**. Add yourself under **Test users**, and add
   the three scopes above under **Data access**.
4. **Credentials → Create credentials → OAuth client ID**, application type
   **Desktop app**. Download the JSON.
5. Save it with tight permissions:

   ```sh
   mkdir -p -m 700 ~/.config/planner-cal
   mv ~/Downloads/client_secret_*.json ~/.config/planner-cal/client_secret.json
   chmod 600 ~/.config/planner-cal/client_secret.json
   ```

### Connect, sync, publish

1. `bun run dev` and open `http://localhost:5173/planner/`. The google panel
   under the publish command says `not connected`.
2. Press **connect google**, sign in, and tick every permission. You come
   back to the planner with `google connected` in the statusline.
3. Open **pull from** and tick the calendars to publish. Then press **sync**.
4. Publish the snapshot with the plans:

   ```sh
   git add public/data/plans.json public/data/google-events.json && git commit -m "plans: update" && git push
   ```

The `google events: on/off` toggle under the calendar hides the overlay on this
browser only. It is stored in localStorage.

### Revoke

Press **disconnect**. It revokes the token at Google (best effort) and deletes
`token.json`, but keeps your settings. You can also remove access at
<https://myaccount.google.com/permissions>. Delete
`~/.config/planner-cal/` to forget everything. planner.cal stays in your
Google account until you delete it there.

### Troubleshooting

- **`access_denied` / "app has not completed verification".** The app is in
  Testing and your account is not a test user. Add it under OAuth consent
  screen → Test users.
- **`redirect_uri_mismatch`.** The client is not a Desktop app (a Web client
  only accepts registered URIs). Create a Desktop app client. Sync sends
  `http://<host you opened>/api/google/callback`, so open the planner on
  `localhost`, `127.0.0.1` or `[::1]`.
- **`scopes`.** You unticked a permission on the consent screen. Connect
  again and leave all three ticked.
- **"access expired or revoked" / reconnect.** The refresh token stopped
  working. You revoked it, changed the client, or the app is still in
  Testing, where Google expires refresh tokens after 7 days. Press
  **reconnect google**.
- **The dev server refuses to start: "PLANNER_CAL_HOME … is inside the
  project".** Point it somewhere outside the repo.

## Troubleshooting

- **Page says `pages · read-only` on localhost.** You are probably on a LAN
  address (for example `http://192.168.x.x:5173`). The page only probes the API
  on loopback hosts, and the API answers loopback clients only. Use
  `localhost` or `127.0.0.1`. Also check that you ran `bun run dev` or
  `bun run preview`, not a plain static server.
- **"plans.json is malformed".** Usually a bad hand edit or a merge conflict.
  Fix the JSON or restore it with `git checkout public/data/plans.json`.
- **Pages doesn't show a new plan.** Make sure the commit containing
  `public/data/plans.json` was pushed and the Pages workflow finished. The
  page fetches with `cache: no-store`, but a CDN can lag for a minute.
- **`vite preview` shows old plans in the page source.** The preview server
  serves `dist/`, but the API reads `public/data/plans.json` directly, so the
  planner always shows current data in local mode.
- **"dev server unreachable".** The dev server stopped while the page was open.
  Restart `bun run dev`. Your form input is kept.
