// Laptop audio on the server: a fake edge-tts that writes files, a fake spawn for
// the default runner. No network and no real edge-tts anywhere in here.
import { EventEmitter } from 'node:events';
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { AUDIO_RATE, AUDIO_VOICE, audioTarget, createAudioJob, createScriptSource, createTtsRunner, parseRange, parseSrt, resolveAudioDir, TtsError } from '../../plugins/news-audio.js';
import { decryptWeek, encryptBacklog, encryptBookmarks, encryptWeek, NEWS_SCOPES } from '../../plugins/news-core.js';
import { createNewsHandler } from '../../plugins/news-sync.js';

const ROOT = resolve(import.meta.dirname, '../..');
const PASS = 'a sufficiently long test passphrase';
const WEEK = '2026-10-30';
const ID1 = 'aaaaaaaaaaa1';
const ID2 = 'bbbbbbbbbbb2';
const ID3 = 'ccccccccccc3';
const ID4 = 'ddddddddddd4';
const MP3 = Buffer.alloc(4096, 7);
const SRT = '1\n00:00:00,050 --> 00:00:02,900\nHello there.\n\n2\n00:00:03,000 --> 00:00:04,000\nGoodbye.\n';

const story = (id, script = `Script of ${id}.`) => ({ id, headline: `Headline ${id}`, script, newsletter: 'Daily', receivedAt: '2026-10-31T09:05:00+08:00' });
const payload = (week, stories) => ({ version: 1, week, generatedAt: '2026-11-04T00:00:00.000Z', stories });

/** Writes valid output like edge-tts does, and records what it was asked for. */
function fakeTts() {
  const tts = { calls: [], active: 0, peak: 0, gate: null };
  tts.run = async (args) => {
    tts.calls.push(args);
    tts.active += 1;
    tts.peak = Math.max(tts.peak, tts.active);
    try {
      await tts.gate;
      await new Promise((ok) => setTimeout(ok, 1));
      await writeFile(args.mp3, MP3);
      await writeFile(args.srt, SRT);
    } finally {
      tts.active -= 1;
    }
  };
  return tts;
}

let dir;
let audioDir;
let tts;
let settings;
let sleeps;

const job = (stories, options = {}) =>
  createAudioJob({
    dir: audioDir,
    runTts: tts.run,
    scripts: async () => ({ stories, unreadable: 0 }),
    settings: async () => settings,
    sleep: async (ms) => sleeps.push(ms),
    now: () => Date.parse('2026-11-04T04:00:00Z'),
    ...options,
  });

const exists = (file) => stat(file).then(() => true, () => false);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'news-audio-'));
  audioDir = join(dir, 'audio');
  tts = fakeTts();
  settings = {};
  sleeps = [];
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('resolveAudioDir', () => {
  test('defaults outside the repo and honours NEWS_FM_AUDIO', () => {
    expect(resolveAudioDir({ root: ROOT, env: {} })).toBe(join(homedir(), '.local/share/news-fm/audio'));
    expect(resolveAudioDir({ root: ROOT, env: { NEWS_FM_AUDIO: '/tmp/somewhere' } })).toBe('/tmp/somewhere');
  });

  test('refuses a directory inside the project', () => {
    expect(() => resolveAudioDir({ root: ROOT, env: { NEWS_FM_AUDIO: join(ROOT, 'public/audio') } })).toThrow('inside the project');
    expect(() => resolveAudioDir({ root: ROOT, env: { NEWS_FM_AUDIO: ROOT } })).toThrow('inside the project');
  });
});

describe('audioTarget', () => {
  test('defaults, overrides, and invalid values never reach the command line', () => {
    expect(audioTarget({})).toEqual({ voice: AUDIO_VOICE, rate: AUDIO_RATE });
    expect(audioTarget({ voice: 'en-GB-SoniaNeural', rate: '-10%' })).toEqual({ voice: 'en-GB-SoniaNeural', rate: '-10%' });
    expect(audioTarget({ voice: 'en-GB-Sonia; rm -rf', rate: '--write-media=x' })).toEqual({ voice: AUDIO_VOICE, rate: AUDIO_RATE });
    expect(audioTarget({ voice: 5, rate: '100%' })).toEqual({ voice: AUDIO_VOICE, rate: AUDIO_RATE });
  });
});

describe('parseSrt', () => {
  test('edge-tts output: comma milliseconds, one cue per sentence', () => {
    expect(parseSrt(SRT)).toEqual([
      { start: 0.05, end: 2.9, text: 'Hello there.' },
      { start: 3, end: 4, text: 'Goodbye.' },
    ]);
  });

  test('CRLF, multi-line cue text, a BOM, dot milliseconds, hours', () => {
    expect(parseSrt('﻿1\r\n01:00:01,500 --> 01:00:02.25\r\nTwo\r\nlines  here.\r\n\r\n')).toEqual([{ start: 3601.5, end: 3602.25, text: 'Two lines here.' }]);
  });

  test('garbage and empty cues are dropped', () => {
    expect(parseSrt('')).toEqual([]);
    expect(parseSrt(null)).toEqual([]);
    expect(parseSrt('1\nnot a time\nText\n\n2\n00:00:01,000 --> 00:00:02,000\n\n3\n00:00:02,000 --> 00:00:03,000\nKept.')).toEqual([{ start: 2, end: 3, text: 'Kept.' }]);
  });
});

describe('parseRange', () => {
  test('forms', () => {
    expect(parseRange(undefined, 100)).toBe(null);
    expect(parseRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=-500', 100)).toEqual({ start: 0, end: 99 });
    expect(parseRange('bytes=50-500', 100)).toEqual({ start: 50, end: 99 });
    expect(parseRange('bytes=100-', 100)).toBe('unsatisfiable');
    expect(parseRange('bytes=9-2', 100)).toBe('unsatisfiable');
    expect(parseRange('bytes=-0', 100)).toBe('unsatisfiable');
    expect(parseRange('bytes=0-1,5-6', 100)).toBe(null);
    expect(parseRange('items=0-1', 100)).toBe(null);
  });
});

describe('the job', () => {
  test('makes every clip: 0600 files in a 0700 directory, with temp files gone', async () => {
    const stories = [story(ID1), story(ID2)];
    const j = job(stories);
    expect(await j.start()).toEqual({ started: true, todo: 2 });
    await j.whenIdle();
    expect((await stat(audioDir)).mode & 0o777).toBe(0o700);
    const names = await readdir(audioDir);
    expect(names.sort()).toEqual([`${ID1}.json`, `${ID1}.mp3`, `${ID1}.srt`, `${ID2}.json`, `${ID2}.mp3`, `${ID2}.srt`, 'state.json'].sort());
    for (const name of names) expect((await stat(join(audioDir, name))).mode & 0o777).toBe(0o600);
    const scriptHash = new Bun.CryptoHasher('sha256').update(story(ID1).script).digest('hex');
    expect(JSON.parse(await readFile(join(audioDir, `${ID1}.json`), 'utf8'))).toEqual({ voice: AUDIO_VOICE, rate: AUDIO_RATE, scriptHash, chars: story(ID1).script.length, createdAt: '2026-11-04T04:00:00.000Z' });
    const s = await j.status();
    expect(s).toMatchObject({ voice: AUDIO_VOICE, rate: AUDIO_RATE, total: 2, done: 2, failed: 0, running: false, ids: [ID1, ID2] });
    expect(s.lastRun).toMatchObject({ made: 2, failed: 0 });
    expect(tts.calls.map((c) => c.text).sort()).toEqual([story(ID1).script, story(ID2).script]);
  });

  test('the second run only makes what is missing', async () => {
    const first = job([story(ID1)]);
    await first.start();
    await first.whenIdle();
    tts.calls.length = 0;
    const second = job([story(ID1), story(ID2)]);
    expect((await second.start()).todo).toBe(1);
    await second.whenIdle();
    expect(tts.calls.map((c) => c.text)).toEqual([story(ID2).script]);
  });

  test('a different voice or rate means not done, and the clip is redone with it', async () => {
    const j = job([story(ID1)]);
    await j.start();
    await j.whenIdle();
    settings = { voice: 'en-GB-SoniaNeural' };
    expect(await j.status()).toMatchObject({ voice: 'en-GB-SoniaNeural', done: 0, ids: [] });
    tts.calls.length = 0;
    expect((await j.start()).todo).toBe(1);
    await j.whenIdle();
    expect(tts.calls[0]).toMatchObject({ voice: 'en-GB-SoniaNeural', rate: AUDIO_RATE });
    expect((await j.status()).done).toBe(1);
    settings = { voice: 'en-GB-SoniaNeural', rate: '-10%' };
    expect((await j.status()).done).toBe(0);
  });

  test('audio follows the script: a changed script means not done, and the clip is redone', async () => {
    const j = job([story(ID1)]);
    await j.start();
    await j.whenIdle();
    expect((await j.status()).done).toBe(1);
    tts.calls.length = 0;
    const changed = job([story(ID1, 'A rewritten script.')]);
    expect(await changed.status()).toMatchObject({ total: 1, done: 0, ids: [] });
    expect((await changed.start()).todo).toBe(1);
    await changed.whenIdle();
    expect(tts.calls.map((c) => c.text)).toEqual(['A rewritten script.']);
    expect((await changed.status()).done).toBe(1);
  });

  test('audio made before scriptHash existed counts as not done', async () => {
    const j = job([story(ID1)]);
    await j.start();
    await j.whenIdle();
    const file = join(audioDir, `${ID1}.json`);
    const { scriptHash, ...old } = JSON.parse(await readFile(file, 'utf8'));
    expect(scriptHash).toMatch(/^[0-9a-f]{64}$/);
    await writeFile(file, JSON.stringify(old));
    expect(await j.status()).toMatchObject({ done: 0, ids: [] });
    expect((await j.start()).todo).toBe(1);
    await j.whenIdle();
    expect((await j.status()).done).toBe(1);
  });

  test('an mp3 under 1 KB or a missing part is not done', async () => {
    const j = job([story(ID1)]);
    await j.start();
    await j.whenIdle();
    await writeFile(join(audioDir, `${ID1}.mp3`), Buffer.alloc(1024));
    expect((await j.status()).done).toBe(0);
    await writeFile(join(audioDir, `${ID1}.mp3`), MP3);
    expect((await j.status()).done).toBe(1);
    await rm(join(audioDir, `${ID1}.srt`));
    expect((await j.status()).done).toBe(0);
  });

  test('retries twice with 2 s and 5 s backoff, then records the reason code only', async () => {
    let tries = 0;
    const j = job([story(ID1, 'Very private script text.')], {
      runTts: async () => {
        tries += 1;
        throw new TtsError('exit_1');
      },
    });
    await j.start();
    await j.whenIdle();
    expect(tries).toBe(3);
    expect(sleeps).toEqual([2000, 5000]);
    const s = await j.status();
    expect(s).toMatchObject({ done: 0, failed: 1, ids: [] });
    expect(s.lastRun).toMatchObject({ made: 0, failed: 1 });
    const saved = await readFile(join(audioDir, 'state.json'), 'utf8');
    expect(JSON.parse(saved).failed).toEqual({ [ID1]: 'exit_1' });
    expect(saved).not.toContain('private');
  });

  test('a retry that works counts as made; an unknown error is reported as spawn', async () => {
    let tries = 0;
    const j = job([story(ID1), story(ID2)], {
      concurrency: 1,
      runTts: async (args) => {
        tries += 1;
        if (args.text.includes(ID2)) throw new Error('secret detail');
        if (tries === 1) throw new TtsError('timeout');
        await tts.run(args);
      },
    });
    await j.start();
    await j.whenIdle();
    expect(await j.status()).toMatchObject({ done: 1, failed: 1, ids: [ID1] });
    expect(JSON.parse(await readFile(join(audioDir, 'state.json'), 'utf8')).failed).toEqual({ [ID2]: 'spawn' });
  });

  test('output that is too small or lacks subtitles is no_audio, and leaves no temp files', async () => {
    const j = job([story(ID1), story(ID2)], {
      runTts: async ({ text, mp3, srt }) => {
        if (text.includes(ID1)) {
          await writeFile(mp3, Buffer.alloc(10));
          await writeFile(srt, SRT);
        } else {
          await writeFile(mp3, MP3);
        }
      },
    });
    await j.start();
    await j.whenIdle();
    expect(JSON.parse(await readFile(join(audioDir, 'state.json'), 'utf8')).failed).toEqual({ [ID1]: 'no_audio', [ID2]: 'no_audio' });
    expect(await readdir(audioDir)).toEqual(['state.json']);
  });

  test('a later success clears the failure', async () => {
    let fail = true;
    const j = job([story(ID1)], {
      runTts: async (args) => {
        if (fail) throw new TtsError('timeout');
        await tts.run(args);
      },
    });
    await j.start();
    await j.whenIdle();
    expect((await j.status()).failed).toBe(1);
    fail = false;
    await j.start();
    await j.whenIdle();
    expect(await j.status()).toMatchObject({ done: 1, failed: 0 });
  });

  test('at most 6 clips run at once', async () => {
    const j = job([ID1, ID2, ID3, ID4, 'eeeeeeeeeee5', 'fffffffffff6', 'aaaaaaaaaab7'].map((id) => story(id)));
    await j.start();
    await j.whenIdle();
    expect(tts.calls).toHaveLength(7);
    expect(tts.peak).toBe(6);
  });

  test('a second start is a 409 while one runs; running and progress show meanwhile', async () => {
    let release;
    tts.gate = new Promise((ok) => {
      release = ok;
    });
    const j = job([story(ID1)]);
    await j.start();
    expect(j.start()).rejects.toMatchObject({ status: 409 });
    expect(await j.status()).toMatchObject({ running: true, done: 0, total: 1 });
    j.trigger(); // skipped, no second job
    release();
    await j.whenIdle();
    expect(tts.calls).toHaveLength(1);
    expect((await j.status()).running).toBe(false);
  });

  test('leftovers from a killed server are removed, script text included', async () => {
    await mkdir(audioDir, { mode: 0o700 });
    await writeFile(join(audioDir, `${ID4}.tmp.mp3`), 'partial');
    await writeFile(join(audioDir, `${ID4}.tmp.mp3.txt`), 'script');
    await writeFile(join(audioDir, `${ID4}.json.tmp`), '{');
    const j = job([]);
    await j.start();
    await j.whenIdle();
    expect(await readdir(audioDir)).toEqual(['state.json']);
  });

  test('tightens an existing directory', async () => {
    await mkdir(audioDir);
    await chmod(audioDir, 0o755);
    const j = job([]);
    await j.start();
    await j.whenIdle();
    expect((await stat(audioDir)).mode & 0o777).toBe(0o700);
  });
});

describe('the default runner', () => {
  function fakeSpawn({ code = 0, hang = false, fail = null } = {}) {
    const fake = { calls: [], kills: [], scripts: [] };
    fake.spawn = (command, args, options) => {
      const child = new EventEmitter();
      child.kill = (signal) => {
        fake.kills.push(signal);
        if (signal === 'SIGKILL') setTimeout(() => child.emit('close', null, 'SIGKILL'), 0);
      };
      fake.calls.push({ command, args, options });
      const scriptFile = args[args.indexOf('--file') + 1];
      readFile(scriptFile, 'utf8').then((text) => {
        fake.scripts.push(text);
        if (fail) child.emit('error', fail);
        else if (!hang) child.emit('close', code, null);
      });
      return child;
    };
    return fake;
  }

  const paths = () => ({ mp3: join(dir, 'x.tmp.mp3'), srt: join(dir, 'x.tmp.srt') });
  const options = () => ({ text: 'Fake sentence.', voice: AUDIO_VOICE, rate: '+0%', ...paths() });

  test('spawns uvx with an args array, the --rate= form, and the script in a file it then deletes', async () => {
    const fake = fakeSpawn();
    await createTtsRunner({ spawn: fake.spawn })(options());
    const [{ command, args, options: spawned }] = fake.calls;
    const { mp3, srt } = paths();
    expect(command).toBe('uvx');
    expect(args).toEqual(['--from', 'edge-tts==7.3.1', 'edge-tts', '--voice', AUDIO_VOICE, '--rate=+0%', '--file', `${mp3}.txt`, '--write-media', mp3, '--write-subtitles', srt]);
    expect(args).not.toContain('Fake sentence.');
    expect(spawned.shell).toBeUndefined();
    expect(spawned.cwd).toBe(dir);
    expect(fake.scripts).toEqual(['Fake sentence.']);
    expect(await exists(`${mp3}.txt`)).toBe(false);
  });

  test('a negative rate stays one argument', async () => {
    const fake = fakeSpawn();
    await createTtsRunner({ spawn: fake.spawn })({ ...options(), rate: '-10%' });
    expect(fake.calls[0].args).toContain('--rate=-10%');
  });

  test('a non-zero exit is exit_<code>, and the script is still deleted', async () => {
    const fake = fakeSpawn({ code: 3 });
    await expect(createTtsRunner({ spawn: fake.spawn })(options())).rejects.toMatchObject({ reason: 'exit_3' });
    expect(await exists(`${paths().mp3}.txt`)).toBe(false);
  });

  test('uvx missing is spawn', async () => {
    const fake = fakeSpawn({ fail: Object.assign(new Error('nope'), { code: 'ENOENT' }) });
    await expect(createTtsRunner({ spawn: fake.spawn })(options())).rejects.toMatchObject({ reason: 'spawn' });
  });

  test('a timeout kills the child, TERM then KILL, and is reported as timeout', async () => {
    const fake = fakeSpawn({ hang: true });
    await expect(createTtsRunner({ spawn: fake.spawn, timeoutMs: 5, killGraceMs: 5 })(options())).rejects.toMatchObject({ reason: 'timeout' });
    expect(fake.kills).toEqual(['SIGTERM', 'SIGKILL']);
    expect(await exists(`${paths().mp3}.txt`)).toBe(false);
  });
});

describe('createScriptSource', () => {
  const indexOf = (weeks, backlog) => async () => ({ weeks, backlog });

  test('collects every file, skips bad ids, and decrypts once per file version', async () => {
    const news = join(dir, 'news');
    await mkdir(news);
    await writeFile(join(news, `${WEEK}.json`), JSON.stringify(await encryptWeek({ weekId: WEEK, payload: payload(WEEK, [story(ID1), story('../../evil'), { id: ID2 }]), passphrase: PASS, iterations: 1000 })));
    await writeFile(join(news, 'backlog.json'), JSON.stringify(await encryptBacklog({ until: WEEK, payload: payload('backlog', [story(ID1), story(ID3)]), passphrase: PASS, iterations: 1000 })));
    const { decryptWeek } = await import('../../plugins/news-core.js');
    let decrypts = 0;
    const scripts = createScriptSource({
      dir: news,
      readIndex: indexOf([WEEK], { until: WEEK }),
      readPassphrase: async () => `${PASS}\n`,
      decrypt: (...args) => {
        decrypts += 1;
        return decryptWeek(...args);
      },
    });
    const first = await scripts();
    expect(first.stories.map((s) => s.id)).toEqual([ID1, ID3]);
    expect(first.stories[1]).toEqual({ id: ID3, script: story(ID3).script });
    expect(first.unreadable).toBe(0);
    await scripts();
    expect(decrypts).toBe(2);
    // A new version of one file costs one derivation.
    await writeFile(join(news, `${WEEK}.json`), JSON.stringify(await encryptWeek({ weekId: WEEK, payload: payload(WEEK, [story(ID4)]), passphrase: PASS, iterations: 1000 })));
    expect((await scripts()).stories.map((s) => s.id)).toEqual([ID4, ID1, ID3]);
    expect(decrypts).toBe(3);
  });

  test('a file under another passphrase or missing is unreadable, not fatal, and is not retried', async () => {
    const news = join(dir, 'news');
    await mkdir(news);
    await writeFile(join(news, `${WEEK}.json`), JSON.stringify(await encryptWeek({ weekId: WEEK, payload: payload(WEEK, [story(ID1)]), passphrase: 'an older passphrase entirely', iterations: 1000 })));
    let decrypts = 0;
    const scripts = createScriptSource({
      dir: news,
      readIndex: indexOf([WEEK, '2026-10-23'], null),
      readPassphrase: async () => PASS,
      decrypt: async () => {
        decrypts += 1;
        throw new Error('wrong');
      },
    });
    expect(await scripts()).toEqual({ stories: [], unreadable: 2 });
    await scripts();
    expect(decrypts).toBe(1);
  });

  test('a clip only the bookmarks still hold gets audio; a published clip wins; no bookmarks is not unreadable', async () => {
    const news = join(dir, 'news');
    await mkdir(news);
    await writeFile(join(news, `${WEEK}.json`), JSON.stringify(await encryptWeek({ weekId: WEEK, payload: payload(WEEK, [story(ID1)]), passphrase: PASS, iterations: 1000 })));
    const scripts = createScriptSource({ dir: news, readIndex: indexOf([WEEK], null), readPassphrase: async () => PASS });
    expect(await scripts()).toEqual({ stories: [{ id: ID1, script: story(ID1).script }], unreadable: 0 });
    await writeFile(join(news, 'bookmarks.json'), JSON.stringify(await encryptBookmarks({ bookmarks: [story(ID2), story(ID1, 'An older script.')], passphrase: PASS, iterations: 1000 })));
    expect(await scripts()).toEqual({
      stories: [
        { id: ID1, script: story(ID1).script },
        { id: ID2, script: story(ID2).script },
      ],
      unreadable: 0,
    });
  });

  test('storiesOf reads one file through the same memory', async () => {
    const news = join(dir, 'news');
    await mkdir(news);
    await writeFile(join(news, `${WEEK}.json`), JSON.stringify(await encryptWeek({ weekId: WEEK, payload: payload(WEEK, [story(ID1)]), passphrase: PASS, iterations: 1000 })));
    let decrypts = 0;
    const scripts = createScriptSource({
      dir: news,
      readIndex: indexOf([WEEK], null),
      readPassphrase: async () => PASS,
      decrypt: async (...args) => {
        decrypts += 1;
        return decryptWeek(...args);
      },
    });
    await scripts();
    expect((await scripts.storiesOf(WEEK, PASS)).map((s) => s.id)).toEqual([ID1]);
    expect(decrypts).toBe(1);
    expect(await scripts.storiesOf('2026-10-23', PASS)).toBeNull();
  });

  test('no usable passphrase is a 400', async () => {
    const make = (text) => createScriptSource({ dir, readIndex: indexOf([], null), readPassphrase: async () => text });
    await expect(make('')()).rejects.toMatchObject({ status: 400 });
    await expect(make('short')()).rejects.toMatchObject({ status: 400 });
  });
});

// ---------------------------------------------------------------- routes

/** Collects bytes as well, because the mp3 route streams. */
function invoke(handler, { method = 'GET', url, headers = {}, remote = '::1' }) {
  return new Promise((ok) => {
    const req = Readable.from([]);
    req.method = method;
    req.url = url;
    req.headers = { host: 'localhost:5181', ...headers };
    req.socket = { remoteAddress: remote };
    const chunks = [];
    const res = new Writable({
      write(chunk, _encoding, done) {
        chunks.push(Buffer.from(chunk));
        done();
      },
    });
    res.statusCode = 200;
    res.headers = {};
    res.setHeader = (k, v) => {
      res.headers[k.toLowerCase()] = v;
    };
    res.on('finish', () => {
      const bytes = Buffer.concat(chunks);
      const isJson = String(res.headers['content-type']).startsWith('application/json');
      ok({ status: res.statusCode, headers: res.headers, bytes, body: isJson && bytes.length ? JSON.parse(bytes) : undefined });
    });
    handler(req, res, () => ok({ status: 'next' }));
  });
}

describe('routes', () => {
  const ACCOUNT = 'digest.account@example.com';
  const SECRET = { installed: { client_id: 'cid.apps.googleusercontent.com', client_secret: 'csecret', redirect_uris: ['http://localhost'] } };
  let root;
  let handler;

  const route = (options) => invoke(handler, options);
  const list = async () => (await route({ url: '/api/news/audio' })).body;
  async function idle() {
    for (let i = 0; i < 500; i += 1) {
      if (!(await list()).running) return;
      await new Promise((ok) => setTimeout(ok, 2));
    }
    throw new Error('the audio job never finished');
  }

  async function publish(stories = [story(ID1), story(ID2)]) {
    const news = join(root, 'public/data/news');
    await mkdir(news, { recursive: true });
    await writeFile(join(news, 'index.json'), JSON.stringify({ version: 1, backlog: { until: WEEK }, weeks: [] }));
    await writeFile(join(news, 'backlog.json'), JSON.stringify(await encryptBacklog({ until: WEEK, payload: payload('backlog', stories), passphrase: PASS, iterations: 1000 })));
  }

  const build = (options = {}) => {
    handler = createNewsHandler({
      home: join(dir, 'home'),
      plannerHome: join(dir, 'planner'),
      root,
      fetch: async () => {
        throw new Error('no network in this test');
      },
      now: () => Date.parse('2026-11-04T04:00:00Z'),
      sleep: async () => {},
      runClaude: async () => ({ stories: [] }),
      iterations: 1000,
      storyDir: join(dir, 'stories'),
      audioDir,
      runTts: tts.run,
      ...options,
    });
  };

  beforeEach(async () => {
    root = join(dir, 'repo');
    await mkdir(root);
    await mkdir(join(dir, 'home'), { mode: 0o700 });
    await mkdir(join(dir, 'planner'));
    await writeFile(join(dir, 'planner/client_secret.json'), JSON.stringify(SECRET));
    await writeFile(join(dir, 'home/settings.json'), JSON.stringify({ account: ACCOUNT }));
    await writeFile(join(dir, 'home/passphrase'), `${PASS}\n`);
    build();
  });

  test('GET reports the list without writing anything', async () => {
    await publish();
    expect(await list()).toEqual({ voice: AUDIO_VOICE, rate: AUDIO_RATE, total: 2, done: 0, failed: 0, running: false, lastRun: null, ids: [], unreadable: 0 });
    expect(await exists(audioDir)).toBe(false);
  });

  test('settings.json chooses the voice and rate', async () => {
    await publish();
    await writeFile(join(dir, 'home/settings.json'), JSON.stringify({ account: ACCOUNT, voice: 'en-GB-SoniaNeural', rate: '+10%' }));
    expect(await list()).toMatchObject({ voice: 'en-GB-SoniaNeural', rate: '+10%' });
  });

  test('POST answers 202 at once, 409 while running, and the job makes the clips', async () => {
    await publish();
    let release;
    tts.gate = new Promise((ok) => {
      release = ok;
    });
    const started = await route({ method: 'POST', url: '/api/news/audio' });
    expect(started.status).toBe(202);
    expect(started.body).toEqual({ started: true, todo: 2 });
    expect((await route({ method: 'POST', url: '/api/news/audio' })).status).toBe(409);
    expect((await list()).running).toBe(true);
    release();
    await idle();
    expect(await list()).toMatchObject({ done: 2, ids: [ID1, ID2], running: false });
    expect(tts.calls.map((c) => c.text)).toEqual([story(ID1).script, story(ID2).script]);
  });

  test('a missing passphrase: GET says so, POST is a 400 and leaves no job running', async () => {
    await publish();
    await rm(join(dir, 'home/passphrase'));
    expect(await list()).toMatchObject({ total: 0, running: false, error: expect.stringContaining('passphrase') });
    expect((await route({ method: 'POST', url: '/api/news/audio' })).status).toBe(400);
    expect((await list()).running).toBe(false);
  });

  test('other methods are 405', async () => {
    expect((await route({ method: 'DELETE', url: '/api/news/audio' })).status).toBe(405);
    expect((await route({ method: 'POST', url: `/api/news/audio/${ID1}.mp3` })).status).toBe(405);
  });

  describe('files', () => {
    const BYTES = Buffer.from(Array.from({ length: 3000 }, (_, i) => i % 251));

    beforeEach(async () => {
      await mkdir(audioDir, { recursive: true });
      await writeFile(join(audioDir, `${ID1}.mp3`), BYTES);
      await writeFile(join(audioDir, `${ID1}.srt`), 'edge\r\n1\r\n00:00:00,050 --> 00:00:02,900\r\nHello\r\nthere.\r\n');
    });

    test('the whole mp3, ready for seeking', async () => {
      const res = await route({ url: `/api/news/audio/${ID1}.mp3` });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('audio/mpeg');
      expect(res.headers['accept-ranges']).toBe('bytes');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['content-length']).toBe(3000);
      expect(res.bytes.equals(BYTES)).toBe(true);
    });

    test('Range answers 206 with the right bytes', async () => {
      const mid = await route({ url: `/api/news/audio/${ID1}.mp3`, headers: { range: 'bytes=100-199' } });
      expect(mid.status).toBe(206);
      expect(mid.headers['content-range']).toBe('bytes 100-199/3000');
      expect(mid.headers['content-length']).toBe(100);
      expect(mid.bytes.equals(BYTES.subarray(100, 200))).toBe(true);
      const tail = await route({ url: `/api/news/audio/${ID1}.mp3`, headers: { range: 'bytes=-10' } });
      expect(tail.status).toBe(206);
      expect(tail.bytes.equals(BYTES.subarray(2990))).toBe(true);
      const open = await route({ url: `/api/news/audio/${ID1}.mp3`, headers: { range: 'bytes=2990-' } });
      expect(open.headers['content-range']).toBe('bytes 2990-2999/3000');
    });

    test('over a real loopback socket, as an <audio> element would ask', async () => {
      const server = createServer((req, res) => handler(req, res, () => res.end()));
      await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
      const url = `http://127.0.0.1:${server.address().port}/api/news/audio/${ID1}.mp3`;
      try {
        const whole = await fetch(url);
        expect(whole.status).toBe(200);
        expect(whole.headers.get('accept-ranges')).toBe('bytes');
        expect(Buffer.from(await whole.arrayBuffer()).equals(BYTES)).toBe(true);
        const part = await fetch(url, { headers: { Range: 'bytes=1000-1099' } });
        expect(part.status).toBe(206);
        expect(part.headers.get('content-range')).toBe('bytes 1000-1099/3000');
        expect(Buffer.from(await part.arrayBuffer()).equals(BYTES.subarray(1000, 1100))).toBe(true);
      } finally {
        server.close();
      }
    });

    test('a range past the end is 416', async () => {
      const res = await route({ url: `/api/news/audio/${ID1}.mp3`, headers: { range: 'bytes=3000-' } });
      expect(res.status).toBe(416);
      expect(res.headers['content-range']).toBe('bytes */3000');
    });

    test('HEAD has the headers and no body', async () => {
      const res = await route({ method: 'HEAD', url: `/api/news/audio/${ID1}.mp3` });
      expect(res.status).toBe(200);
      expect(res.headers['content-length']).toBe(3000);
      expect(res.bytes.length).toBe(0);
    });

    test('cues come parsed, in seconds', async () => {
      const res = await route({ url: `/api/news/audio/${ID1}.cues.json` });
      expect(res.status).toBe(200);
      expect(res.body).toEqual([{ start: 0.05, end: 2.9, text: 'Hello there.' }]);
    });

    test('unknown clips, invalid ids and traversal are 404, and nothing leaks', async () => {
      await writeFile(join(dir, 'secret.mp3'), 'do not serve');
      await writeFile(join(audioDir, 'aaa.mp3'), 'short id');
      for (const name of [
        `${ID2}.mp3`,
        `${ID2}.cues.json`,
        `${ID1}.srt`,
        `${ID1}.json`,
        `${ID1}.mp3.txt`,
        `${ID1.toUpperCase()}.mp3`,
        'aaa.mp3',
        'state.json',
        '../secret.mp3',
        '..%2Fsecret.mp3',
        '%2e%2e/secret.mp3',
        `../audio/${ID1}.mp3`,
        `${ID1}/../${ID1}.mp3`,
        '/etc/passwd',
      ]) {
        const res = await route({ url: `/api/news/audio/${name}` });
        expect([name, res.status]).toEqual([name, 404]);
        expect(res.bytes.toString()).not.toContain('do not serve');
      }
    });

    test('non-loopback clients, foreign hosts and origins are refused', async () => {
      for (const url of ['/api/news/audio', `/api/news/audio/${ID1}.mp3`, `/api/news/audio/${ID1}.cues.json`]) {
        expect((await route({ url, remote: '192.168.1.20' })).status).toBe(403);
        expect((await route({ url, headers: { host: 'evil.example' } })).status).toBe(403);
        expect((await route({ url, headers: { origin: 'https://evil.example' } })).status).toBe(403);
      }
      expect((await route({ method: 'POST', url: '/api/news/audio', remote: '192.168.1.20' })).status).toBe(403);
      expect((await route({ method: 'POST', url: '/api/news/audio', headers: { origin: 'https://evil.example' } })).status).toBe(403);
    });
  });

  test('without an audio directory the routes are 404 and nothing can start', async () => {
    build({ audioDir: null });
    expect((await route({ url: '/api/news/audio' })).status).toBe(404);
    expect((await route({ method: 'POST', url: '/api/news/audio' })).status).toBe(404);
    expect((await route({ url: `/api/news/audio/${ID1}.mp3` })).status).toBe(404);
  });

  describe('after a sync', () => {
    const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    const b64 = (text) => Buffer.from(text, 'utf8').toString('base64url');
    const at = Date.parse('2026-10-15T09:00:00+08:00');
    const message = { id: 'm1', internalDate: String(at), payload: { mimeType: 'text/plain', filename: '', headers: [{ name: 'From', value: 'Daily <a@example.org>' }, { name: 'Subject', value: 's' }], body: { data: b64('The harbour tunnel reopens.') } } };

    const gmail = (messages) => async (input) => {
      const url = new URL(input);
      if (url.href === 'https://oauth2.googleapis.com/token') return json(200, { access_token: 'at', expires_in: 3599 });
      if (url.pathname.endsWith('/messages')) return json(200, messages.length ? { messages: messages.map((m) => ({ id: m.id })) } : {});
      return json(200, messages[0]);
    };

    const syncRoute = () => route({ method: 'POST', url: '/api/news/sync' });
    const connect = () => writeFile(join(dir, 'home/token.json'), JSON.stringify({ access_token: 'at', refresh_token: 'rt', expires_at: Date.parse('2026-11-04T05:00:00Z'), email: ACCOUNT, scope: NEWS_SCOPES.join(' ') }));

    test('a sync that published starts the job, without waiting for it or changing the answer', async () => {
      await connect();
      let release;
      tts.gate = new Promise((ok) => {
        release = ok;
      });
      build({ fetch: gmail([message]), runClaude: async () => ({ stories: [{ headline: 'Tunnel', script: 'The tunnel reopens.' }] }) });
      // Answering at all, with the fake edge-tts stuck on its gate, proves the sync does not wait.
      const res = await syncRoute();
      expect(res.status).toBe(200);
      expect(res.body.published.length).toBeGreaterThan(0);
      expect(Object.keys(res.body).sort()).toEqual(['emails', 'published', 'skipped', 'stories']);
      expect(res.body.skipped).toBe(null);
      expect(res.body.stories).toBe(1);
      expect((await list()).running).toBe(true);
      release();
      await idle();
      expect(tts.calls.map((c) => c.text)).toEqual(['The tunnel reopens.']);
      expect((await list()).done).toBe(1);
    });

    test('a failing audio job does not touch the sync answer', async () => {
      await connect();
      build({
        fetch: gmail([message]),
        runClaude: async () => ({ stories: [{ headline: 'Tunnel', script: 'The tunnel reopens.' }] }),
        runTts: async () => {
          throw new TtsError('exit_1');
        },
      });
      const res = await syncRoute();
      expect(res.status).toBe(200);
      expect(res.body.skipped).toBe(null);
      await idle();
      expect(await list()).toMatchObject({ done: 0, failed: 1 });
    });

    test('a sync that published nothing starts nothing', async () => {
      await connect();
      await publish();
      await writeFile(join(root, 'public/data/news/index.json'), JSON.stringify({ version: 1, backlog: { until: '2026-10-30' }, weeks: [] }));
      build({ fetch: gmail([]), now: () => Date.parse('2026-11-04T04:00:00Z') });
      const res = await syncRoute();
      expect(res.status).toBe(200);
      expect(res.body.published).toEqual([]);
      expect(await list()).toMatchObject({ running: false, lastRun: null });
      expect(tts.calls).toEqual([]);
      expect(await exists(audioDir)).toBe(false);
    });

    test('a sync while a job runs skips the second job', async () => {
      await connect();
      await publish([story(ID1)]);
      let release;
      tts.gate = new Promise((ok) => {
        release = ok;
      });
      await writeFile(join(root, 'public/data/news/index.json'), JSON.stringify({ version: 1, backlog: { until: '2026-10-23' }, weeks: [] }));
      build({ fetch: gmail([]) });
      expect((await route({ method: 'POST', url: '/api/news/audio' })).status).toBe(202);
      const res = await syncRoute();
      expect(res.status).toBe(200);
      expect(res.body.published).toContain('2026-10-23');
      release();
      await idle();
      expect(tts.calls).toHaveLength(1);
    });
  });
});
