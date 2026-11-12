# news.fm

Reads the whole inbox of one dedicated Google account once a week, rewrites each
news story as a short spoken script with headless `claude -p`, encrypts the
result, and writes it to `public/data/news/` for GitHub Pages. The page at `/news/`
asks for the passphrase, decrypts in the browser and reads the clips aloud.

## How it works

```
 laptop, by hand, once a week                                GitHub Pages
 ────────────────────────────────────────────────────        ───────────────────────────
 POST …/api/news/sync (loopback only)
    │ messages.list + messages.get ◄── Gmail (read-only)
    ▼
 email to plain text (links become tags like [L3], max 30,000 chars)
    │ stdin
    ▼
 claude -p --model sonnet --tools "" … ──► stories per email, each naming its tag
   (4 emails at a time)
    ▼
 encrypt (PBKDF2 + AES-256-GCM)
    ▼
 public/data/news/backlog.json (first sync), <week>.json, index.json, bookmarks.json
    │ git add/commit/push ──────────────────────►  data/news/*.json
                                                        │ fetch (ciphertext)
                                                        ▼
                                            phone: page asks for the passphrase,
                                            decrypts, speechSynthesis reads it
```

Nothing runs in the background. Nothing talks to Google or Claude until you
connect or POST a sync or a backlog rebuild. The API exists only in `vite` and `vite preview`, and only
answers loopback clients. Pure logic is in `plugins/news-core.js`; the handler and
the Claude runner are in `plugins/news-sync.js`; the page is in `src/news/`.

## The page

`/news/` is the `news.fm` buffer, or `g n` from anywhere. Enter the passphrase once.
With "remember on this device" ticked it stays in `localStorage`, in plain text.
`:lock` or the `lock` button removes it and locks the page. A remembered passphrase
that stops working is dropped, and the form says so.

Wrap-ups are listed newest first, with the first wrap-up (the backlog) last. The page
opens the newest one with unheard clips, at the clip where you left off. Each file
has its own salt, so each costs a full key derivation (about a second on a phone).
They decrypt one at a time in the background, and a row you select jumps the queue.

A clip is spoken one sentence at a time, and the current sentence is highlighted.
When a clip ends it counts as heard, and the next starts after 600 ms. Skipping a
clip does not count as hearing it. At the end of a wrap-up, the page stops and offers
the next unheard one.

| key (not while typing) | touch | command | does |
|---|---|---|---|
| `Space` | play button | `:play` | play, pause, resume |
| `j` `↓` `→` | swipe up | `:next` | next clip |
| `k` `↑` `←` | swipe down | `:prev` | previous clip |
| `+` `-` | settings | `:speed` (cycles) | speed, 0.8–1.6 in 0.1 steps |
| `b` | `☆` button | `:bookmark` | bookmark or un-bookmark the clip, on localhost only |
| | `lock` button | `:lock` | forget the passphrase |
| | sync panel | `:sync` | sync, on localhost only |

Under **settings** are the voice, the speed and autoplay. The default voice is the
best English one the browser has. Voice and speed apply from the next sentence.

`?w=<week|backlog|bookmarks>` and `#clip-<id>` follow the player, so a URL points at a
clip.

On a loopback host a sync panel sits below the player: account, backlog progress,
pending weeks, last sync, laptop audio, `connect google`, `sync`, `make audio`,
`rebuild backlog` and the publish command. Pages does not render it and makes no `/api`
request.

### Links

A clip has `email ↗` and `article ↗` below its text, when it has them. They open in
a new tab and sit outside the swipe area, so a tap cannot turn the clip. Files from
before format 2 have no links, and their clips show none.

- **email** opens the original in Gmail. It only works on a device logged in to the
  news account.
- **article** is the link Claude picked for that story, if any.

Claude never sees a URL. While an email becomes text, each link turns into a tag:
`<a href="X">anchor</a>` into `anchor [L1]`, a bare URL into `[L1]`, and the same
address into the same tag. A story answers with a tag, and a tag that email does not
have counts as none. Tags are removed from the headline and script again, so they are
never spoken.

Some links get no tag and never reach a file: other schemes (`mailto:`, `tel:`,
`javascript:`, `data:`), footer links (unsubscribe, opt-out, preferences, manage
subscription, update profile, view in browser, web version), and links past the first
150 in an email.

**Links are never fetched.** Resolving a tracking redirect over the network would
register a click, so the real address is only read out of the URL itself: a path
segment holding a percent-encoded URL (TLDR's `/CL0/https:%2F%2F…`) or the parameters
`url`, `u`, `target`, `redirect`, `redirect_url`, `dest`, `destination`, `link`, and `q`
on `google.com/url`, up to three levels. `utm_*`, `mc_cid`, `mc_eid` and `ref_src` are
then removed. A redirect that does not carry its target in the URL stays as it is, so
opening that article does count as a click for the newsletter.

### Bookmarks

**The laptop edits, every device reads.** On localhost the `☆` button, `b` and
`:bookmark` save the clip to `public/data/news/bookmarks.json`, which reaches the phone
with the usual publish command. Pages has no toggle, key or command, and sends no `/api`
request. Every card shows `★` when its story is bookmarked.

With any bookmarks, a `★ bookmarks` row sits at the top of the wrap-ups. It plays them
as a wrap-up, newest saved first, with its own heard count and `?w=bookmarks`. On the
laptop they play in Ava by story id.

The request only names a story: `POST …/api/news/bookmarks { id, week, on }`. The server
reads that story from the published file and copies it, so nothing the page sends ends
up in the file. Adding answers 404 for a story not in that file, and 409 with no
passphrase file, when a file does not open, or at the limit of 500 (nothing is pushed
out; remove one first). `GET …/api/news/bookmarks` answers `{ ids }`.

A bookmark stores `id`, `week`, `headline`, `script`, `newsletter`, `receivedAt`, `links`
and `savedAt`. It is a copy, encrypted with its own salt and bound to the name
`bookmarks`, so a week file renamed to it does not open. It keeps its text if the
backlog is rebuilt later; if that same id then has a new script, the Ava audio follows
the new script. A `bookmarks.json` this passphrase cannot open is refused and left alone.

### What stays on the device

Decrypted text is held in memory only. `localStorage` holds `news.fm.progress` (per
wrap-up and the bookmarks: last clip index and heard clip ids), `news.fm.settings` (voice
name, speed, autoplay) and `news.fm.passphrase` if you asked for it. Links and the
account address are only ever in memory too. Opening a link is the one thing that leaves
the page: the browser asks for that address, as with any link.

### Limitations

Browser speech is not a background audio stream. [Laptop audio](#laptop-audio-ava)
is, but only on the laptop.

- **Speech usually stops when the phone screen locks or the browser goes to the
  background.** The page does not mark the rest as heard. It pauses at that sentence,
  and play resumes there. On a desktop, switching tabs keeps reading.
- **The first play needs a tap.** iOS and Android only allow speech from a gesture.
- **Voices vary by device.** Google voices in desktop Chrome need a network
  connection. With no voices at all, the text still shows and play is disabled with
  the reason.
- **Swipes work below 1024 px wide.** There the clip takes over vertical drags, so
  scroll the page from the controls or use `wrap-ups ↓`. A long script scrolls with
  the drag, without momentum, and turns the clip only from its top or bottom edge.
- **Decrypting needs a secure context.** `http://192.168.x.x` has no Web Crypto, and
  the page says so. Use `localhost` or the Pages site.
- **A rotated passphrase locks older files.** Published weeks are not re-encrypted,
  so their rows show `✗ other passphrase`.

## Laptop audio (Ava)

On the laptop, clips can play as real audio files in Microsoft's Ava voice, through
[edge-tts](https://github.com/rany2/edge-tts). **The phone and the Pages site still
use device voices.** The audio exists only on this machine: it is never written into
the repository and never published.

```
 a sync or rebuild published something, or the "make audio" button
    │
    ▼
 decrypt public/data/news/*.json with the passphrase file (in memory)
    │ the script of each clip that has no audio yet (6 at a time)
    ▼
 uvx --from edge-tts==7.3.1 edge-tts … ──► Microsoft's Edge read-aloud service
    ▼
 ~/.local/share/news-fm/audio/<id>.mp3, .srt, .json
    │ GET /api/news/audio/<id>.mp3 and <id>.cues.json (loopback only)
    ▼
 localhost page: <audio>, sentence highlight from the cues
```

A job starts right after a sync or backlog rebuild that published something, or with
**make audio** in the panel (`curl -s -X POST localhost:5173/api/news/audio`). It runs in the
background and the POST answers at once, `202 { "started": true, "todo": n }`, or
409 if a job is running. A sync's answer neither waits for the job nor reports it, and
a sync during a job does not start a second one. `uvx` must be on the dev server's
`PATH`. There is nothing to install: uv fetches that exact edge-tts on first use.

A clip gets 90 seconds and two retries, 2 s and 5 s later. One that still fails keeps
the device voice and counts as failed in the panel. `state.json` in the audio
directory has the reason, a code only: `timeout`, `no_audio`, `exit_<code>` or `spawn`.
**make audio** tries it again. A published file that cannot be decrypted (an older
passphrase) is skipped and shown in the panel.

On the page, a clip with audio plays through one `<audio>` element and the card says
`voice · Ava`. Anything else uses the speech path above and says `voice · device`:
no audio yet, a failed clip, a 404, a dead dev server. The switch is silent.

- Keys, swipes, next, previous and heard work the same.
- The speed setting applies at once, with pitch preserved.
- Audio keeps playing with the screen off or the tab hidden. Media keys and the lock
  screen show the headline and control it.
- The highlight follows the cues. When the engine's sentences differ from the page's
  it goes by text, and if the text does not line up there is no highlight.

Optional, in `settings.json`:

```json
{ "voice": "en-US-AvaMultilingualNeural", "rate": "+0%" }
```

`voice` has to look like `en-GB-SoniaNeural` and `rate` like `-10%`; anything else
falls back to these defaults. A clip made with another voice or rate, or from another
script (`scriptHash`, a sha256 in `<id>.json`), counts as not done, so changing the voice
or rate means pressing **make audio** to redo every clip. Until then those clips use the
device voice. Audio made before `scriptHash` existed counts as not done too.

Set `NEWS_FM_AUDIO` to use a different directory. The dev server refuses to start if
it is inside the project. The directory is 0700, the files 0600.

**Privacy.** Every script is sent to Microsoft in plain text. This uses the service
behind Edge's read-aloud through an unofficial client, not a product with terms made
for this, so it may change or stop working at any time; the device voice is what is
left then. The mp3 and srt files on the laptop are plaintext, unlike the published
files. Headlines, newsletter names and email text are not sent.

To delete all of it:

```sh
rm -r ~/.local/share/news-fm/audio
```

## Weeks

A week is [Friday 00:00, next Friday 00:00) in `Asia/Hong_Kong`, and its id is that
Friday's date, such as `2026-10-30`. Only complete weeks are published. The current
week never is.

A sync publishes every complete week after the newest one in `index.json`, oldest
first, each as its own file. Weekly wrap-ups start where the backlog ends.

## The backlog (first sync)

The first sync wraps the whole history into one file, `backlog.json`: every email
before the Friday that starts the current week. That Friday is saved as
`backlogUntil` in `settings.json` at the first sync and never moves, so a backlog
that takes several syncs (even across a Friday) still ends in the same place, and
no email is in both the backlog and a week. Its stories run newest first.

```
 every email before Fri <backlogUntil> 00:00 HKT ─► backlog.json   (published once)
 week <backlogUntil>, the week after, …           ─► <week>.json   (one per week)
```

A long history does not fit in one sync's 80 Claude calls, so the backlog is
resumable. Each email's stories are cached in `~/.cache/news-fm/stories/` (0700;
files 0600, named by a hash of the message id) and the next sync continues where
the last stopped; `status` shows `backlog: { state, until, done, total }`.
`backlog.json` is written only when every email is done, then the cache is deleted.
Emails go to Claude 4 at a time. A failed email stops the sync: nothing new
starts, and the ones already running finish and stay cached. No weekly wrap-up is
published until the backlog is.

The cache is plaintext (scripts, article links, newsletter names, arrival times) on
this machine only. Delete `~/.cache/news-fm/stories/` to start the backlog over.

### Rebuilding the backlog

**rebuild backlog** in the panel (`curl -s -X POST localhost:5173/api/news/backlog/rebuild`)
runs every email of the published backlog through Claude again, 4 at a time, for
example to give it links. It uses the same window and is built like the first one:
resumable, at most 80 Claude calls per press (or `maxEmails`), and `status` shows
`backlog.rebuild: { done, total, running }`. A failed email stops it and the finished
ones stay cached. It answers like a sync, with the reason in `skipped`; a non-null
`skipped` means press it again.

- **The old `backlog.json` stays published and playable until the new one is complete**,
  then it is replaced in one rename and the cache is dropped. `index.json` is not touched.
- Its cache entries have their own key, and so do the first build's. Entries from before
  format 2 have no links and are never reused.
- **Sync and rebuild share one lock:** while one runs the other answers 409. Between two
  rebuild presses a weekly sync works as usual, because neither writes what the other
  does, so an unfinished rebuild never holds up a week.
- Once it publishes, the audio job starts, as after a sync. The rewritten scripts no longer
  match their audio, so those clips use the device voice until the job has remade them.
- The open page keeps the copy it decrypted. Reload it to play the new one. Then publish.

A week with no email is still published, with no stories, so the timeline has no
holes.

If any email in a week fails (Gmail error, Claude error, invalid output), that week
is not written and the sync stops. Later weeks wait, because publishing them would
leave a gap that later syncs never fill. Earlier weeks are kept, and the next sync
resumes at the failed week.

Each sync makes at most 80 Claude calls and stops before a week that would go over.
Sync again to continue. A single week with more than 80 emails can never fit, so set
`"maxEmails"` in `settings.json` to get past it.

## One-time setup

The OAuth client is the planner's `client_secret.json`. See
[PLANNER.md](PLANNER.md#one-time-setup) if you do not have one yet.

1. In the planner's Google Cloud project, under **APIs & Services → Library**, enable
   **Gmail API**.
2. Under **Google Auth Platform → Data access**, add
   `https://www.googleapis.com/auth/gmail.readonly`.
3. Under **Audience → Test users**, add the news account.
4. Create the secrets directory, the passphrase and the settings:

   ```sh
   mkdir -p -m 700 ~/.config/news-fm
   bash -c 'read -rs -p "passphrase: " p && printf "%s" "$p" > ~/.config/news-fm/passphrase && chmod 600 ~/.config/news-fm/passphrase && unset p && echo'
   (umask 077; echo '{ "account": "<the news account address>" }' > ~/.config/news-fm/settings.json)
   ```

   Keep a copy of the passphrase in a password manager. You will type it on the
   phone, and a lost passphrase cannot be recovered.

Set `NEWS_FM_HOME` to use a different directory. The dev server refuses to start if
that directory is inside the project.

| file | written by | contents |
|---|---|---|
| `settings.json` | you, then sync | `account`, `lastSync`, `needsReconnect`, `backlogUntil` and `backlogProgress` (set by the first sync), `backlogRebuild` (while a rebuild is unfinished), optional `maxEmails`, `voice` and `rate` |
| `passphrase` | you | the encryption passphrase, at least 8 characters; only read |
| `token.json` | connect | refresh and access token, signed-in address (mode 0600) |

## Connect and sync

Use the sync panel at <http://localhost:5173/news/>, or the API directly. With
`bun run dev` running:

1. Press **connect google** (or open <http://localhost:5173/api/news/connect>) and
   sign in with the news account. You land back on `/news/`, and the statusline
   reports the result.
2. Check the state in the panel, or with:

   ```sh
   curl -s localhost:5173/api/news/status
   ```

3. Press **sync**. This can take several minutes, since it makes one Claude call per
   email. The panel counts the seconds and shows the backlog as it progresses. With
   curl, the response only arrives at the end:

   ```sh
   curl -s -X POST localhost:5173/api/news/sync
   ```

   It answers `{ "published": [weeks], "skipped": reason or null, "emails": n, "stories": n }`.
   A failed or capped week still answers 200, with the reason in `skipped`. Read it:
   a non-null `skipped` means work is left, and `pending` in the status lists it.

4. Publish (the panel has this command with a copy button):

   ```sh
   git add public/data/news && git commit -m "news: update" && git push
   ```

To disconnect, run `curl -s -X POST localhost:5173/api/news/disconnect`. It revokes
the token at Google (best effort), deletes `token.json` and keeps your settings.

## Privacy

**Public, forever in git history:** the week dates, the ciphertext and each file's
size, which shows roughly how much news a week had and how many bookmarks there are.
The files cannot be un-published by deleting them later.

**Encrypted:** the headline, script, newsletter name, received time and links of each
story, plus when the file was generated, and the same copied into the bookmarks.
Newsletter is the sender's display name, or the domain's label (`bbc`) when there is
none. Stories have an `id` that is a sha256 prefix and reveals nothing. Since format 2
(`"version": 2`; version 1 files stay readable), `links` holds `email`, a Gmail address
that contains **the news account's address and the message id**, and `article`. The owner
accepted that. Neither is ever in a headline, a script, a newsletter name or anything
outside the ciphertext. An `article` URL can carry whatever the newsletter put in it,
including a subscriber id when the redirect could not be unwrapped.

**Never in a published file, even encrypted:** email bodies, subjects, the senders'
addresses, and any link other than the one chosen for a story. Claude only sees link
tags, and URLs, tags and addresses are stripped again from what it returns.

**Passphrase strength is the whole protection.** Anyone can download the ciphertext
and guess offline for as long as they like, at the cost of 600,000 PBKDF2 rounds per
guess. The server requires at least 8 characters. That is enough only for random
characters from every key type (letters of both cases, digits, symbols); a word,
name or date of that length falls to a dictionary attack. Several random words are
a longer, easier-to-type alternative. Changing it later does not re-encrypt published weeks, and old ciphertext
stays in git history under the old passphrase.

**Inbox text goes to Anthropic.** The text of every email in the account, including
ones that turn out not to be news, is sent to Claude under your plan's terms. That
is why this should be a dedicated account. Do not point it at a personal inbox.

**Gmail access is read-only, but it covers the whole mailbox.** `gmail.readonly` has
no narrower form.

**Scripts go to Microsoft** when laptop audio is made. See
[Laptop audio](#laptop-audio-ava).

## Prompt injection

Email is untrusted, and anyone can send mail to the account. The guards:

- The model is pinned to Sonnet (`--model sonnet`); the plan's default is not used.
- `--tools ""` gives Claude no tools, so an email cannot make it read files, run
  commands or fetch URLs. `--strict-mcp-config` and `--setting-sources ""` keep out
  MCP servers, hooks and settings. The working directory is an empty folder under
  `~/.cache/news-fm/`.
- The system prompt says the email is data, and text that tries to close the
  `<email>` tags is removed first.
- Output is validated, capped and stripped of URLs and addresses. A story's link can
  only be a tag from that email's own table, so Claude cannot be talked into a new URL.

What this does not stop: a crafted email can still influence the words of its own
story, because the words are the output. It also picks where its own `article ↗` goes,
because the sender wrote the links. A script is only ever text read aloud, but do not
treat it or the link as verified. Only the sender's claims are behind them.

## Testing-mode token expiry

While the OAuth app is in **Testing**, Google expires refresh tokens after 7 days.
With a weekly sync, expect to connect again most weeks. The sync reports it in
`skipped`, and the status shows `needsReconnect: true`.

## Troubleshooting

- **`reason=wrong_account`.** You signed in with an account other than `account` in
  `settings.json`, or the address is written differently there (Gmail may report the
  address with different dots). The token was dropped, not saved and not revoked:
  the OAuth client is shared with the planner, and revoking a grant for the planner's
  account could log the planner out. The unused access token expires within an hour.
  Connect again and pick the news account.
- **`reason=no_account`.** `settings.json` has no `account`.
- **`reason=not_configured`.** The planner's `client_secret.json` is missing.
- **`reason=scopes`.** You unticked the Gmail permission on the consent screen, or
  the scope is not under **Data access**. Connect again.
- **`reason=access_denied`.** The news account is not a test user.
- **`redirect_uri_mismatch`.** The client is not a Desktop app, or you did not open a
  loopback host. Use `localhost`, `127.0.0.1` or `[::1]`.
- **`Gmail API has not been used in project …` in `skipped`.** Enable the Gmail API
  in the project that owns the client.
- **400 "the passphrase is too short".** It needs 8 characters, not counting the
  trailing newline. Replace it before anything is published.
- **`claude exited with … no JSON result; is it logged in?` or `Not logged in` in
  `skipped`.** Run `claude` once in a terminal and log in. The runner removes
  `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN`, so it only uses that login.
- **`claude is not on PATH`.** Start the dev server from a shell that has `claude`.
- **`claude timed out after 180 s`.** The week was not written. Sync again.
- **"index.json is malformed".** Usually a merge conflict. Fix it or restore it with
  `git checkout public/data/news/index.json`. It is never overwritten.
- **`curl` was interrupted during a sync.** The sync still finishes on the server.
  Check `syncing` and `published` in `status`.
- **Every clip fails with `spawn` in `state.json`.** `uvx` is not on the dev server's
  `PATH`. Install uv, or start the dev server from a shell that has it.
- **Clips fail with `exit_1` or `no_audio`.** The read-aloud service refused or
  changed, or there is no network. Press **make audio** later.

Tests: `bun test tests/news/`. They use a fake Gmail, a fake Claude, a fake edge-tts
and fake `speechSynthesis` and `<audio>`.
