// news.fm laptop audio: edge-tts clips for the local page. Files live outside the
// repository and are only ever served to loopback clients through news-sync.js;
// nothing here runs on Pages. Scripts go to Microsoft's Edge read-aloud service.
// See docs/NEWS.md.
//
//   GET  …/api/news/audio                -> { voice, rate, total, done, failed, running, lastRun, ids }
//   POST …/api/news/audio                -> 202 { started, todo }, 409 while a job runs
//   GET  …/api/news/audio/<id>.mp3       -> audio/mpeg with Range support
//   GET  …/api/news/audio/<id>.cues.json -> [{ start, end, text }] in seconds
import { spawn as nodeSpawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { chmod, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream';
import { sha256Hex } from './google-core.js';
import { isInside, realish, writeAtomic } from './google-sync.js';
import { HttpError, send } from './http.js';
import { BACKLOG_ID, BOOKMARKS_ID, checkPassphrase, decryptWeek, MIN_PASSPHRASE } from './news-core.js';

export const AUDIO_VOICE = 'en-US-AvaMultilingualNeural';
export const AUDIO_RATE = '+0%';
const EDGE_TTS = 'edge-tts==7.3.1';
const VOICE_RE = /^[a-z]{2}-[A-Z]{2}-[A-Za-z]+Neural$/;
const RATE_RE = /^[+-]\d{1,2}%$/;
const ID_RE = /^[0-9a-f]{12}$/;
const CLIP_FILE_RE = /^([0-9a-f]{12})\.(mp3|cues\.json)$/;
const LEFTOVER_RE = /\.tmp(?:\.|$)/;
const MIN_MP3_BYTES = 1024;
const CONCURRENCY = 3;
const BACKOFF_MS = [2000, 5000];
const TTS_TIMEOUT_MS = 90_000;
const KILL_GRACE_MS = 5_000;
const STATE_FILE = 'state.json';

/**
 * The audio directory: $NEWS_FM_AUDIO or ~/.local/share/news-fm/audio.
 * Throws when it resolves inside the project, so audio can never be committed or served by Pages.
 */
export function resolveAudioDir({ root, env = process.env }) {
  const dir = resolve(env.NEWS_FM_AUDIO || join(homedir(), '.local', 'share', 'news-fm', 'audio'));
  const top = resolve(root);
  if (isInside(top, dir) || isInside(realish(top), realish(dir))) {
    throw new Error(`news.fm: NEWS_FM_AUDIO (${dir}) is inside the project (${top}). Keep audio outside the repository.`);
  }
  return dir;
}

/** `voice` and `rate` from settings.json. An invalid value falls back: these reach a command line. */
export function audioTarget(settings) {
  return {
    voice: VOICE_RE.test(settings?.voice ?? '') ? settings.voice : AUDIO_VOICE,
    rate: RATE_RE.test(settings?.rate ?? '') ? settings.rate : AUDIO_RATE,
  };
}

// ---------------------------------------------------------------- subtitles

const CUE_TIME_RE = /(\d+):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d+):(\d{2}):(\d{2})[,.](\d{1,3})/;
const seconds = (h, m, s, ms) => (Number(h) * 3_600_000 + Number(m) * 60_000 + Number(s) * 1000 + Number(ms.padEnd(3, '0'))) / 1000;

/** SRT text as [{ start, end, text }] in seconds. Blocks that do not parse are dropped. */
export function parseSrt(text) {
  const cues = [];
  for (const block of String(text ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const lines = block.split('\n');
    const at = lines.findIndex((line) => line.includes('-->'));
    const time = at < 0 ? null : CUE_TIME_RE.exec(lines[at]);
    const body = lines.slice(at + 1).join(' ').replace(/\s+/g, ' ').trim();
    if (time && body) cues.push({ start: seconds(...time.slice(1, 5)), end: seconds(...time.slice(5, 9)), text: body });
  }
  return cues;
}

// ---------------------------------------------------------------- edge-tts

/** A failed clip. `reason` is a code (timeout, no_audio, exit_<code>, spawn), never script text. */
export class TtsError extends Error {
  constructor(reason) {
    super(`edge-tts: ${reason}`);
    this.name = 'TtsError';
    this.reason = reason;
  }
}

/**
 * The default runner: edge-tts through uvx, so no Python lands in this repo. The
 * script goes in a temp file next to the output and is deleted afterwards. The cwd
 * is the audio directory, so uv never picks anything up from the project.
 */
export function createTtsRunner({ spawn = nodeSpawn, env = process.env, timeoutMs = TTS_TIMEOUT_MS, killGraceMs = KILL_GRACE_MS } = {}) {
  return async function runTts({ text, voice, rate, mp3, srt }) {
    const script = `${mp3}.txt`;
    await writeFile(script, text, { encoding: 'utf8', mode: 0o600 });
    try {
      await new Promise((ok, fail) => {
        // --rate=<rate>: a separate "-10%" would be parsed as a flag.
        const args = ['--from', EDGE_TTS, 'edge-tts', '--voice', voice, `--rate=${rate}`, '--file', script, '--write-media', mp3, '--write-subtitles', srt];
        const child = spawn('uvx', args, { cwd: dirname(mp3), env, stdio: 'ignore' });
        let timedOut = false;
        let killer;
        const timer = setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
          killer = setTimeout(() => child.kill('SIGKILL'), killGraceMs);
        }, timeoutMs);
        const stop = () => {
          clearTimeout(timer);
          clearTimeout(killer);
        };
        child.on('error', () => {
          stop();
          fail(new TtsError('spawn'));
        });
        child.on('close', (code, signal) => {
          stop();
          if (timedOut) fail(new TtsError('timeout'));
          else if (code === 0) ok();
          else fail(new TtsError(`exit_${code ?? signal}`));
        });
      });
    } finally {
      await rm(script, { force: true });
    }
  };
}

// ---------------------------------------------------------------- scripts

/**
 * { stories: [{ id, script }], unreadable }: every story of every published file,
 * then any clip only the bookmarks still hold. Each file costs a full key
 * derivation, so results (failures too, since the status poll would otherwise pay
 * for them every time) are kept in memory per file version. A file under an older
 * passphrase counts as unreadable. `scripts.storiesOf(id, passphrase)` reads one
 * file through the same memory: its stories, or null when missing or unreadable.
 */
export function createScriptSource({ dir, readIndex, readPassphrase, decrypt = decryptWeek }) {
  const cache = new Map(); // wrap-up id -> { key, stories: Promise<[…] | null> }

  async function open(id, passphrase) {
    const file = join(dir, `${id}.json`);
    let info;
    try {
      info = await stat(file);
    } catch {
      return null;
    }
    const key = `${info.mtimeMs}:${info.size}:${passphrase}`;
    let entry = cache.get(id);
    if (entry?.key !== key) {
      const stories = readFile(file, 'utf8')
        .then((text) => decrypt(JSON.parse(text), passphrase, { week: id }))
        .then((payload) => {
          const stories = id === BOOKMARKS_ID ? payload?.bookmarks : payload?.stories;
          return Array.isArray(stories) ? stories : null;
        })
        .catch(() => null);
      entry = { key, stories };
      cache.set(id, entry);
    }
    return entry.stories;
  }

  async function scripts() {
    const passphrase = await readPassphrase();
    const state = checkPassphrase(passphrase);
    if (state === 'missing') throw new HttpError(400, `the passphrase file is missing or empty; see docs/NEWS.md (at least ${MIN_PASSPHRASE} characters)`);
    if (state === 'too-short') throw new HttpError(400, `the passphrase is too short; it needs at least ${MIN_PASSPHRASE} characters`);
    const index = await readIndex();
    const found = new Map();
    const collect = (stories) => {
      for (const s of stories ?? []) {
        // The id ends up in a file name.
        if (ID_RE.test(s?.id ?? '') && typeof s.script === 'string' && s.script.trim() && !found.has(s.id)) found.set(s.id, { id: s.id, script: s.script });
      }
    };
    let unreadable = 0;
    for (const id of [...index.weeks, ...(index.backlog ? [BACKLOG_ID] : [])]) {
      const stories = await open(id, passphrase);
      if (!stories) unreadable += 1;
      collect(stories);
    }
    // Last, so a published clip wins. Having no bookmarks is normal, not "unreadable".
    collect(await open(BOOKMARKS_ID, passphrase));
    return { stories: [...found.values()], unreadable };
  }
  scripts.storiesOf = open;
  return scripts;
}

// ---------------------------------------------------------------- job

async function pool(items, size, work) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      next += 1;
      await work(items[next - 1]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
}

/**
 * One job at a time: makes every clip without audio for the current voice, rate
 * and script text. A clip counts as done only with its mp3 (over 1 KB), srt and a
 * matching <id>.json. Options are injectable for tests: runTts, scripts, settings, sleep, now.
 */
export function createAudioJob({ dir, runTts = createTtsRunner(), scripts, settings, sleep = (ms) => new Promise((ok) => setTimeout(ok, ms)), now = Date.now, concurrency = CONCURRENCY }) {
  let running = false;
  let live = null; // { failed } while a job runs, so the panel can show them at once
  let work = Promise.resolve();

  const path = (name) => join(dir, name);
  const statOf = (file) => stat(file).catch(() => null);

  async function isDone({ id, script }, target) {
    const [mp3, srt, meta, scriptHash] = await Promise.all([
      statOf(path(`${id}.mp3`)),
      statOf(path(`${id}.srt`)),
      readFile(path(`${id}.json`), 'utf8').then(JSON.parse).catch(() => null),
      sha256Hex(script),
    ]);
    return mp3?.isFile() && mp3.size > MIN_MP3_BYTES && srt?.isFile() && meta?.voice === target.voice && meta?.rate === target.rate && meta?.scriptHash === scriptHash;
  }

  async function doneIds(stories, target) {
    const flags = await Promise.all(stories.map((s) => isDone(s, target)));
    return stories.filter((_, i) => flags[i]).map((s) => s.id);
  }

  async function readState() {
    try {
      const state = JSON.parse(await readFile(path(STATE_FILE), 'utf8'));
      return { lastRun: state?.lastRun ?? null, failed: state?.failed ?? {} };
    } catch {
      return { lastRun: null, failed: {} };
    }
  }

  async function status() {
    const target = audioTarget(await settings());
    let source = { stories: [], unreadable: 0 };
    let error;
    try {
      source = await scripts();
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      error = err.message;
    }
    const ids = await doneIds(source.stories, target);
    const done = new Set(ids);
    const state = await readState();
    const failed = live?.failed ?? state.failed;
    return {
      ...target,
      total: source.stories.length,
      done: ids.length,
      failed: source.stories.filter((s) => failed[s.id] && !done.has(s.id)).length,
      running,
      lastRun: state.lastRun,
      ids,
      unreadable: source.unreadable,
      ...(error ? { error } : {}),
    };
  }

  /** Written next to the result and renamed in, the <id>.json last: a crash in between means "not done". */
  async function makeClip(story, target) {
    const mp3 = path(`${story.id}.tmp.mp3`);
    const srt = path(`${story.id}.tmp.srt`);
    try {
      await runTts({ text: story.script, ...target, mp3, srt });
      const [audio, subtitles] = await Promise.all([statOf(mp3), statOf(srt)]);
      if (!(audio?.size > MIN_MP3_BYTES) || !subtitles) throw new TtsError('no_audio');
      await chmod(mp3, 0o600);
      await chmod(srt, 0o600);
      await rename(srt, path(`${story.id}.srt`));
      await rename(mp3, path(`${story.id}.mp3`));
      const scriptHash = await sha256Hex(story.script);
      await writeAtomic(path(`${story.id}.json`), JSON.stringify({ ...target, scriptHash, chars: story.script.length, createdAt: new Date(now()).toISOString() }), 0o600);
    } finally {
      await rm(mp3, { force: true });
      await rm(srt, { force: true });
    }
  }

  async function execute(todo, target, startedAt) {
    const failed = {};
    live = { failed };
    let made = 0;
    await pool(todo, concurrency, async (story) => {
      for (let attempt = 0; ; attempt += 1) {
        try {
          await makeClip(story, target);
          made += 1;
          return;
        } catch (err) {
          if (attempt >= BACKOFF_MS.length) {
            failed[story.id] = err instanceof TtsError ? err.reason : 'spawn';
            return;
          }
          await sleep(BACKOFF_MS[attempt]);
        }
      }
    });
    const lastRun = { startedAt, finishedAt: new Date(now()).toISOString(), made, failed: Object.keys(failed).length };
    await writeAtomic(path(STATE_FILE), JSON.stringify({ lastRun, failed }), 0o600);
  }

  /** Answers as soon as the work is planned; the clips are made in the background. */
  async function start() {
    if (running) throw new HttpError(409, 'an audio job is already running');
    running = true;
    let todo;
    let target;
    const startedAt = new Date(now()).toISOString();
    try {
      const { stories } = await scripts();
      target = audioTarget(await settings());
      await mkdir(dir, { recursive: true, mode: 0o700 });
      await chmod(dir, 0o700);
      // What a killed dev server left behind, script text included.
      for (const name of await readdir(dir)) if (LEFTOVER_RE.test(name)) await rm(path(name), { force: true });
      const done = new Set(await doneIds(stories, target));
      todo = stories.filter((s) => !done.has(s.id));
    } catch (err) {
      running = false;
      throw err;
    }
    work = execute(todo, target, startedAt)
      .catch(() => {})
      .finally(() => {
        running = false;
        live = null;
      });
    return { started: true, todo: todo.length };
  }

  return {
    status,
    start,
    /** Fire and forget, for after a sync: skipped while a job runs, and it never throws. */
    trigger() {
      if (!running) start().catch(() => {});
    },
    whenIdle: () => work,
  };
}

// ---------------------------------------------------------------- serving

/** { start, end } (inclusive), null for the whole file (no header or a form not supported), or 'unsatisfiable'. */
export function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header ?? '');
  if (!m || (!m[1] && !m[2])) return null;
  if (!m[1]) {
    const tail = Number(m[2]);
    return tail > 0 ? { start: Math.max(0, size - tail), end: size - 1 } : 'unsatisfiable';
  }
  const start = Number(m[1]);
  const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  return start < size && start <= end ? { start, end } : 'unsatisfiable';
}

/** One clip file by name. Only a valid <id>.mp3 or <id>.cues.json ever becomes a path. */
export async function serveClip(req, res, dir, name) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: `${req.method} not allowed on an audio file` }, { Allow: 'GET' });
  const notFound = () => send(res, 404, { error: 'no such clip' });
  const match = CLIP_FILE_RE.exec(name);
  if (!match) return notFound();
  const [, id, kind] = match;

  if (kind === 'cues.json') {
    let text;
    try {
      text = await readFile(join(dir, `${id}.srt`), 'utf8');
    } catch {
      return notFound();
    }
    return send(res, 200, parseSrt(text));
  }

  const file = join(dir, `${id}.mp3`);
  const info = await stat(file).catch(() => null);
  if (!info?.isFile() || !info.size) return notFound();
  const range = parseRange(req.headers.range, info.size);
  res.setHeader('Accept-Ranges', 'bytes');
  if (range === 'unsatisfiable') return send(res, 416, { error: 'range not satisfiable' }, { 'Content-Range': `bytes */${info.size}` });
  const { start, end } = range ?? { start: 0, end: info.size - 1 };
  res.statusCode = range ? 206 : 200;
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Length', end - start + 1);
  if (range) res.setHeader('Content-Range', `bytes ${start}-${end}/${info.size}`);
  if (req.method === 'HEAD') return res.end();
  // A seek aborts the request; pipeline tears both ends down and there is no one left to tell.
  pipeline(createReadStream(file, { start, end }), res, () => {});
}
