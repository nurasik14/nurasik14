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
 email to plain text (no URLs, max 30,000 chars)
    │ stdin
    ▼
 claude -p --tools "" … ──► stories per email
    ▼
 encrypt (PBKDF2 + AES-256-GCM)
    ▼
 public/data/news/backlog.json (first sync), <week>.json, index.json
    │ git add/commit/push ──────────────────────►  data/news/*.json
                                                        │ fetch (ciphertext)
                                                        ▼
                                            phone: page asks for the passphrase,
                                            decrypts, speechSynthesis reads it
```

Nothing runs in the background. Nothing talks to Google or Claude until you
connect or POST a sync. The API exists only in `vite` and `vite preview`, and only
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
| | `lock` button | `:lock` | forget the passphrase |
| | sync panel | `:sync` | sync, on localhost only |

Under **settings** are the voice, the speed and autoplay. The default voice is the
best English one the browser has. Voice and speed apply from the next sentence.

`?w=<week|backlog>` and `#clip-<id>` follow the player, so a URL points at a clip.

On a loopback host a sync panel sits below the player: account, backlog progress,
pending weeks, last sync, laptop audio, `connect google`, `sync`, `make audio` and the
publish command. Pages does not render it and makes no `/api` request.

### What stays on the device

Decrypted text is held in memory only. `localStorage` holds `news.fm.progress` (per
wrap-up: last clip index and heard clip ids), `news.fm.settings` (voice name, speed,
autoplay) and `news.fm.passphrase` if you asked for it.

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
 sync published something, or the "make audio" button
    │
    ▼
 decrypt public/data/news/*.json with the passphrase file (in memory)
    │ the script of each clip that has no audio yet (3 at a time)
    ▼
 uvx --from edge-tts==7.3.1 edge-tts … ──► Microsoft's Edge read-aloud service
    ▼
 ~/.local/share/news-fm/audio/<id>.mp3, .srt, .json
    │ GET /api/news/audio/<id>.mp3 and <id>.cues.json (loopback only)
    ▼
 localhost page: <audio>, sentence highlight from the cues
```

A job starts right after a sync that published something, or with **make audio** in
the panel (`curl -s -X POST localhost:5173/api/news/audio`). It runs in the
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
falls back to these defaults. A clip made with another voice or rate counts as not
done, so changing either means pressing **make audio** to redo every clip. Until
then those clips use the device voice.

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
A failed email stops the sync; the ones before it stay cached. No weekly wrap-up is
published until the backlog is.

The cache is plaintext (scripts, newsletter names, arrival times) on this machine
only. Delete `~/.cache/news-fm/stories/` to start the backlog over.

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
| `settings.json` | you, then sync | `account`, `lastSync`, `needsReconnect`, `backlogUntil` and `backlogProgress` (set by the first sync), optional `maxEmails`, `voice` and `rate` |
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

3. Press **sync**. This can take many minutes, since it makes one Claude call per
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
size, which shows roughly how much news a week had. The files cannot be
un-published by deleting them later.

**Encrypted:** only the headline, script, newsletter name and received time of each
story, plus when the file was generated. Newsletter is the sender's display name,
or the domain's label (`bbc`) when there is none. Stories have an `id` that is a
sha256 prefix and reveals nothing.

**Never in a published file, even encrypted:** email bodies, email addresses,
message ids, subjects and links. URLs are stripped before Claude sees the text, and
URLs and addresses are stripped again from what it returns.

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

- `--tools ""` gives Claude no tools, so an email cannot make it read files, run
  commands or fetch URLs. `--strict-mcp-config` and `--setting-sources ""` keep out
  MCP servers, hooks and settings. The working directory is an empty folder under
  `~/.cache/news-fm/`.
- The system prompt says the email is data, and text that tries to close the
  `<email>` tags is removed first.
- Output is validated, capped and stripped of URLs and addresses.

What this does not stop: a crafted email can still influence the words of its own
story, because the words are the output. A script is only ever text read aloud, but
do not treat it as verified. Only the sender's claims are behind it.

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
