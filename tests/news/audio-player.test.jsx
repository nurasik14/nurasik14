// Laptop audio on the page: cue mapping, the controller's <audio> path against a
// fake element, and each state's markup, as in page.test.jsx. No DOM, no network.
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { encryptBacklog } from '../../plugins/news-core.js';
import { audioSummary, clipTiming, createAudioSource, mapCues, sentenceAt, voiceLabel } from '../../src/news/audio.js';
import Player from '../../src/news/Player.jsx';
import { SpeechController } from '../../src/news/speech.js';
import { openWrapUp } from '../../src/news/store.js';
import { AudioButton, AudioRow } from '../../src/news/SyncPanel.jsx';

const AVA = 'en-US-AvaMultilingualNeural';
const cue = (start, end, text) => ({ start, end, text });

describe('labels', () => {
  test('the short voice name', () => {
    expect(voiceLabel(AVA)).toBe('Ava');
    expect(voiceLabel('en-GB-SoniaNeural')).toBe('Sonia');
    expect(voiceLabel('weird')).toBe('weird');
    expect(voiceLabel(null)).toBe('');
    expect(audioSummary({ done: 104, total: 108, voice: AVA })).toBe('104/108 · Ava');
  });
});

describe('mapCues', () => {
  const sentences = ['The U.S. economy grew.', 'Markets rose 3.5 percent!', 'Nobody knows why.'];

  test('equal counts map one to one', () => {
    expect(mapCues([cue(0, 1, 'a'), cue(1, 2, 'b'), cue(2, 3, 'c')], sentences)).toEqual([0, 1, 2]);
  });

  test('a cue split inside a sentence maps to that sentence', () => {
    const cues = [cue(0, 1, 'The U.S.'), cue(1, 2, 'economy grew.'), cue(2, 3, 'Markets rose 3.5 percent!'), cue(3, 4, 'Nobody knows why.')];
    expect(mapCues(cues, sentences)).toEqual([0, 0, 1, 2]);
  });

  test('a cue over two sentences starts at the first, and punctuation and case do not matter', () => {
    const cues = [cue(0, 2, 'the u.s economy grew — markets rose 3.5 percent'), cue(2, 3, 'NOBODY KNOWS WHY')];
    expect(mapCues(cues, sentences)).toEqual([0, 2]);
  });

  test('a cue that matches nothing keeps the highlight where it is, and none matching means no highlight', () => {
    expect(mapCues([cue(0, 1, 'The U.S. economy grew.'), cue(1, 2, 'something else')], sentences)).toEqual([0, null]);
    expect(mapCues([cue(0, 1, 'one'), cue(1, 2, 'two')], sentences)).toBe(null);
    expect(clipTiming([cue(0, 1, 'one'), cue(1, 2, 'two')], sentences)).toBe(null);
  });

  test('nothing to map', () => {
    expect(mapCues([], sentences)).toBe(null);
    expect(mapCues(null, sentences)).toBe(null);
    expect(mapCues([cue(0, 1, 'a')], [])).toBe(null);
  });
});

describe('sentenceAt', () => {
  const timing = clipTiming([cue(0.05, 1, 'a'), cue(1.2, 2, 'b')], ['a', 'b']);

  test('the sentence whose cue contains the time; gaps and edges say nothing', () => {
    expect(sentenceAt(timing, 0)).toBe(-1);
    expect(sentenceAt(timing, 0.05)).toBe(0);
    expect(sentenceAt(timing, 1.1)).toBe(-1);
    expect(sentenceAt(timing, 1.2)).toBe(1);
    expect(sentenceAt(timing, 2)).toBe(-1);
    expect(sentenceAt(null, 1)).toBe(-1);
    expect(sentenceAt({ cues: [cue(0, 1, 'x')], map: [null] }, 0.5)).toBe(-1);
  });
});

describe('createAudioSource', () => {
  const make = (extra = {}) => {
    const loads = [];
    const preloadEl = { src: '' };
    const source = createAudioSource({
      ids: ['a1'],
      url: (id) => `/audio/${id}.mp3`,
      loadCues: async (id) => {
        loads.push(id);
        if (id === 'bad') throw new Error('404');
        return [cue(0, 1, id)];
      },
      preloadEl,
      ...extra,
    });
    return { source, loads, preloadEl };
  };

  test('has follows the list', () => {
    const { source } = make();
    expect(source.has('a1')).toBe(true);
    source.setIds(['b2']);
    expect(source.has('a1')).toBe(false);
    expect(source.has('b2')).toBe(true);
  });

  test('cues load once while a clip stays listed, and a clip that left is read again', async () => {
    const { source, loads } = make();
    await source.cues('a1');
    await source.cues('a1');
    expect(loads).toEqual(['a1']);
    source.setIds(['a1']);
    await source.cues('a1');
    expect(loads).toEqual(['a1']);
    source.setIds([]);
    source.setIds(['a1']);
    await source.cues('a1');
    expect(loads).toEqual(['a1', 'a1']);
  });

  test('a failed cue load is null and tried again next time', async () => {
    const { source, loads } = make();
    expect(await source.cues('bad')).toBe(null);
    expect(await source.cues('bad')).toBe(null);
    expect(loads).toEqual(['bad', 'bad']);
  });

  test('preload loads the cues and points the spare element at the file, once', async () => {
    const { source, loads, preloadEl } = make();
    source.preload('a1');
    expect(preloadEl.src).toBe('/audio/a1.mp3');
    preloadEl.src = 'untouched';
    source.preload('a1');
    expect(preloadEl.src).toBe('untouched');
    expect(loads).toEqual(['a1']);
  });
});

// ---------------------------------------------------------------- controller

class FakeMedia {
  listeners = {};
  paused = true;
  ended = false;
  currentTime = 0;
  playbackRate = 1;
  defaultPlaybackRate = 1;
  sources = [];
  plays = 0;
  pauses = 0;
  playResult = Promise.resolve();

  set src(url) {
    this.sources.push(url);
    this.currentTime = 0;
    this.ended = false;
    // Like the real load algorithm.
    this.playbackRate = this.defaultPlaybackRate;
  }

  get src() {
    return this.sources.at(-1);
  }

  addEventListener(name, fn) {
    this.listeners[name] = fn;
  }

  fire(name) {
    this.listeners[name]?.();
  }

  play() {
    this.plays += 1;
    this.paused = false;
    return this.playResult;
  }

  pause() {
    this.pauses += 1;
    this.paused = true;
  }

  tick(seconds) {
    this.currentTime = seconds;
    this.fire('timeupdate');
  }

  // The order the spec gives: pause, then ended.
  finish() {
    this.ended = true;
    this.paused = true;
    this.fire('pause');
    this.fire('ended');
  }
}

class FakeSynth {
  speaking = false;
  pending = false;
  paused = false;
  spoken = [];
  speak(u) {
    this.spoken.push(u);
    this.speaking = true;
  }
  cancel() {
    this.speaking = false;
  }
  resume() {}
  finish() {
    this.speaking = false;
    this.spoken.at(-1).onend?.();
  }
  get texts() {
    return this.spoken.map((u) => u.text);
  }
}

class FakeUtterance {
  constructor(text) {
    this.text = text;
  }
}

const CLIPS = [
  { id: 'with1', sentences: ['First one.', 'Second one.'] },
  { id: 'none2', sentences: ['Device one.', 'Device two.'] },
  { id: 'with3', sentences: ['Third.'] },
];

function setup({ ids = ['with1', 'with3'], cues = { with1: [cue(0.05, 1, 'First one.'), cue(1, 2, 'Second one.')], with3: [cue(0, 1, 'Third.')] }, synth = new FakeSynth(), ...options } = {}) {
  const media = new FakeMedia();
  const timers = [];
  const ended = [];
  const messages = [];
  const preloaded = [];
  const audio = {
    known: new Set(ids),
    has(id) {
      return this.known.has(id);
    },
    url: (id) => `/audio/${id}.mp3`,
    cues: async (id) => cues[id] ?? null,
    preload: (id) => preloaded.push(id),
  };
  const controller = new SpeechController({
    synth,
    Utterance: FakeUtterance,
    media,
    audio,
    gapMs: 600,
    schedule: (fn) => {
      const t = { fn };
      timers.push(t);
      return () => timers.splice(timers.indexOf(t), 1);
    },
    onClipEnd: (clip) => ended.push(clip.id),
    onMessage: (text) => messages.push(text),
    ...options,
  });
  controller.setQueue(CLIPS, 0, 'w');
  const runTimers = () => {
    for (const t of timers.splice(0)) t.fn();
  };
  return { controller, media, synth, ended, messages, preloaded, audio, timers, runTimers };
}

const settle = () => new Promise((ok) => setTimeout(ok, 0));

describe('choosing the engine per clip', () => {
  test('a clip with audio plays through the element, not speech, synchronously', () => {
    const { controller, media, synth } = setup();
    controller.play();
    expect(media.plays).toBe(1);
    expect(media.src).toBe('/audio/with1.mp3');
    expect(synth.spoken).toEqual([]);
    expect(controller.getSnapshot().status).toBe('playing');
    expect(controller.usesAudio(CLIPS[0])).toBe(true);
    expect(controller.usesAudio(CLIPS[1])).toBe(false);
    expect(controller.usesAudio(null)).toBe(false);
  });

  test('a clip without audio uses speech', () => {
    const { controller, media, synth } = setup();
    controller.goTo(1);
    controller.play();
    expect(media.plays).toBe(0);
    expect(synth.texts).toEqual(['Device one.']);
  });

  test('without a media element nothing changes', () => {
    const synth = new FakeSynth();
    const controller = new SpeechController({ synth, Utterance: FakeUtterance, schedule: () => () => {} });
    controller.setQueue(CLIPS, 0, 'w');
    controller.play();
    expect(synth.texts).toEqual(['First one.']);
    expect(controller.usesAudio(CLIPS[0])).toBe(false);
  });

  test('audio plays with no speech engine at all, and a later clip without audio halts instead of crashing', () => {
    const { controller, media, messages, runTimers } = setup({ synth: null, Utterance: null });
    controller.play();
    expect(media.plays).toBe(1);
    media.finish();
    runTimers();
    expect(controller.getSnapshot()).toMatchObject({ status: 'paused', clip: 1 });
    expect(messages.at(-1)).toContain('no device voice');
  });
});

describe('playing through the element', () => {
  test('uses the speed setting, with pitch preserved, surviving the load', () => {
    const { controller, media } = setup({ rate: 1.3 });
    controller.play();
    expect(media.playbackRate).toBe(1.3);
    expect(media.preservesPitch).toBe(true);
    controller.setRate(0.9);
    expect(media.playbackRate).toBe(0.9);
    controller.goTo(2);
    expect(media.src).toBe('/audio/with3.mp3');
    expect(media.playbackRate).toBe(0.9);
  });

  test('the highlight follows the cues', async () => {
    const { controller, media } = setup();
    controller.play();
    expect(controller.getSnapshot().sentence).toBe(-1);
    await settle();
    media.tick(0.5);
    expect(controller.getSnapshot().sentence).toBe(0);
    media.tick(1.5);
    expect(controller.getSnapshot().sentence).toBe(1);
    media.tick(9); // past every cue: stays
    expect(controller.getSnapshot().sentence).toBe(1);
  });

  test('cues that cannot be mapped mean no highlight, and the clip still plays and ends', async () => {
    const { controller, media, ended } = setup({ cues: { with1: [cue(0, 1, 'unrelated'), cue(1, 2, 'text'), cue(2, 3, 'here')] } });
    controller.play();
    await settle();
    media.tick(0.5);
    expect(controller.getSnapshot().sentence).toBe(-1);
    media.finish();
    expect(ended).toEqual(['with1']);
  });

  test('no cues at all: the same', async () => {
    const { controller, media } = setup({ cues: {} });
    controller.play();
    await settle();
    media.tick(0.5);
    expect(controller.getSnapshot().sentence).toBe(-1);
  });

  test('pause keeps the position, and resume does not reload', async () => {
    const { controller, media } = setup();
    controller.play();
    await settle();
    media.tick(1.5);
    controller.toggle();
    expect(media.paused).toBe(true);
    expect(controller.getSnapshot()).toMatchObject({ status: 'paused', sentence: 1 });
    media.fire('pause'); // arrives after the status changed: ignored
    controller.toggle();
    expect(media.paused).toBe(false);
    expect(media.sources).toHaveLength(1);
    expect(media.currentTime).toBe(1.5);
    expect(controller.getSnapshot()).toMatchObject({ status: 'playing', sentence: 1 });
  });

  test('a pause from outside (headphones) becomes paused, a play from outside becomes playing', () => {
    const { controller, media } = setup();
    controller.play();
    media.paused = true;
    media.fire('pause');
    expect(controller.getSnapshot().status).toBe('paused');
    media.paused = false;
    media.fire('play');
    expect(controller.getSnapshot().status).toBe('playing');
  });

  test('ended marks heard once and auto-advances after the gap', () => {
    const { controller, media, synth, ended, runTimers } = setup();
    controller.play();
    media.finish();
    expect(ended).toEqual(['with1']);
    expect(controller.getSnapshot()).toMatchObject({ status: 'gap', clip: 1, sentence: 0 });
    runTimers();
    expect(synth.texts).toEqual(['Device one.']);
    expect(controller.getSnapshot().status).toBe('playing');
    synth.finish();
    synth.finish();
    expect(ended).toEqual(['with1', 'none2']);
    runTimers();
    expect(media.src).toBe('/audio/with3.mp3');
    expect(media.plays).toBe(2);
    media.finish();
    expect(ended).toEqual(['with1', 'none2', 'with3']);
    expect(controller.getSnapshot().status).toBe('finished');
  });

  test('autoplay off stops at ended, and play again reloads the clip', () => {
    const { controller, media } = setup({ autoplay: false });
    controller.play();
    media.finish();
    expect(controller.getSnapshot().status).toBe('ended');
    controller.play();
    expect(media.sources).toEqual(['/audio/with1.mp3', '/audio/with1.mp3']);
    expect(media.plays).toBe(2);
  });

  test('next and prev move while playing, and stop the element', () => {
    const { controller, media, synth } = setup();
    controller.play();
    controller.next();
    expect(media.paused).toBe(true);
    expect(synth.texts).toEqual(['Device one.']);
    controller.next();
    expect(media.src).toBe('/audio/with3.mp3');
    expect(media.paused).toBe(false);
    controller.prev();
    expect(media.paused).toBe(true);
    expect(synth.texts).toEqual(['Device one.', 'Device one.']);
  });

  test('going to the same clip restarts it', () => {
    const { controller, media } = setup();
    controller.play();
    media.currentTime = 1;
    controller.goTo(0);
    expect(media.sources).toHaveLength(2);
    expect(media.currentTime).toBe(0);
  });

  test('a stale event after moving on does nothing', () => {
    const { controller, media, ended } = setup();
    controller.play();
    controller.setQueue(CLIPS, 1, 'w');
    media.fire('ended');
    media.fire('error');
    expect(ended).toEqual([]);
    expect(controller.usesAudio(CLIPS[0])).toBe(true);
  });

  test('preloads the next clip only when it has audio', () => {
    const { controller, preloaded, audio } = setup();
    controller.play();
    expect(preloaded).toEqual([]); // the next clip has none
    audio.known.add('none2');
    controller.goTo(1);
    expect(preloaded).toEqual(['with3']);
  });

  test('a clip whose audio appears mid-speech finishes in speech', () => {
    const { controller, media, synth, audio } = setup();
    controller.goTo(1);
    controller.play();
    audio.known.add('none2');
    synth.finish();
    expect(synth.texts).toEqual(['Device one.', 'Device two.']);
    expect(media.plays).toBe(0);
  });
});

describe('falling back', () => {
  test('an error event carries the clip on as speech, silently, and it stays speech', () => {
    const { controller, media, synth, messages, runTimers } = setup();
    controller.play();
    media.fire('error');
    expect(synth.texts).toEqual(['First one.']);
    expect(messages).toEqual([]);
    expect(controller.getSnapshot().status).toBe('playing');
    expect(controller.usesAudio(CLIPS[0])).toBe(false);
    controller.goTo(0);
    runTimers();
    expect(media.sources).toHaveLength(1);
    expect(synth.texts).toEqual(['First one.', 'First one.']);
  });

  test('both the rejected play() and the error event only fall back once', async () => {
    const { controller, media, synth } = setup();
    media.playResult = Promise.reject(Object.assign(new Error('no source'), { name: 'NotSupportedError' }));
    controller.play();
    await settle();
    media.fire('error');
    expect(synth.texts).toEqual(['First one.']);
  });

  test('an interrupted play() is not an error', async () => {
    const { controller, media, synth } = setup();
    media.playResult = Promise.reject(Object.assign(new Error('interrupted'), { name: 'AbortError' }));
    controller.play();
    await settle();
    expect(synth.spoken).toEqual([]);
    expect(controller.getSnapshot().status).toBe('playing');
  });

  test('a blocked play() pauses and says press play, the audio is not given up on', async () => {
    const { controller, media, messages } = setup();
    media.playResult = Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
    controller.play();
    await settle();
    expect(controller.getSnapshot().status).toBe('paused');
    expect(messages).toEqual(['the browser blocked audio · press play']);
    expect(controller.usesAudio(CLIPS[0])).toBe(true);
  });

  test('audio that vanished while paused resumes as speech from the first sentence, not as heard', () => {
    const { controller, media, synth, ended, audio } = setup();
    controller.play();
    controller.pause();
    audio.known.clear();
    controller.play();
    expect(synth.texts).toEqual(['First one.']);
    expect(ended).toEqual([]);
    expect(media.plays).toBe(1);
  });
});

describe('the screen going off', () => {
  test('recheck leaves audio alone and the "false heard" guard is speech only', () => {
    const { controller, media, ended, messages } = setup({ isHidden: () => true, now: () => 0 });
    controller.play();
    controller.recheck();
    expect(controller.getSnapshot().status).toBe('playing');
    expect(media.paused).toBe(false);
    media.finish();
    expect(ended).toEqual(['with1']);
    expect(messages).toEqual([]);
  });

  test('speech still halts on a dead engine', () => {
    const { controller, synth, ended, messages } = setup({ isHidden: () => true, now: () => 0 });
    controller.goTo(1);
    controller.play();
    synth.speaking = false;
    controller.recheck();
    expect(controller.getSnapshot().status).toBe('paused');
    expect(ended).toEqual([]);
    expect(messages[0]).toContain('hidden');
  });
});

// ---------------------------------------------------------------- markup

const PASSPHRASE = 'correct horse battery';
const stories = [
  { id: 'aaaaaaaaaaa1', headline: 'Rates held', script: 'One. Two.', newsletter: 'Brew', receivedAt: '2026-10-31T09:05:00+08:00' },
  { id: 'bbbbbbbbbbb2', headline: 'Chips', script: 'Three.', newsletter: 'Strat', receivedAt: '2026-11-01T18:30:00+08:00' },
];
const file = await encryptBacklog({ until: '2026-10-30', payload: { version: 1, week: 'backlog', generatedAt: 'x', stories }, passphrase: PASSPHRASE, iterations: 1000 });
const first = await openWrapUp('backlog', PASSPHRASE, { fetch: async () => ({ ok: true, status: 200, json: async () => file }) });
const entries = [{ id: 'backlog', kind: 'backlog', label: 'first wrap-up', short: 'first wrap-up' }];
const synth = { speaking: false, pending: false, paused: false, getVoices: () => [{ name: 'Samantha', lang: 'en-US' }] };
const list = (ids) => ({ voice: AVA, rate: '+0%', total: 2, done: ids.length, failed: 0, running: false, lastRun: null, ids, unreadable: 0 });
const render = (props) => renderToStaticMarkup(<Player entries={entries} first={first} passphrase={PASSPHRASE} onLock={() => {}} synth={synth} {...props} />);
const element = () => new FakeMedia();

describe('the page', () => {
  test('Pages and a plain render: no label, no laptop line, no media element', () => {
    let made = 0;
    const html = render({ createMedia: () => (made += 1) });
    expect(made).toBe(0);
    expect(html).not.toContain('voice ·');
    expect(html).not.toContain('laptop audio');
    expect(html).toContain('voice and speed apply from the next sentence');
  });

  test('a clip with audio: the Ava label, the read-only voice and the device picker for fallback', () => {
    const html = render({ local: true, audio: list(['aaaaaaaaaaa1']), createMedia: element });
    expect(html).toContain('voice · Ava');
    expect(html).toContain(`laptop audio: ${AVA}`);
    expect(html).toContain('device voice, for clips without laptop audio');
    expect(html).toContain('Samantha (en-US)');
  });

  test('a clip without audio says device', () => {
    const html = render({ local: true, audio: list(['bbbbbbbbbbb2']), createMedia: element });
    expect(html).toContain('voice · device');
    expect(html).not.toContain('voice · Ava');
  });

  test('no clips made yet: device, and no laptop line', () => {
    const html = render({ local: true, audio: list([]), createMedia: element });
    expect(html).toContain('voice · device');
    expect(html).not.toContain('laptop audio:');
  });

  test('without speech a clip with audio can still play', () => {
    const html = render({ synth: null, local: true, audio: list(['aaaaaaaaaaa1']), createMedia: element });
    expect(html).not.toContain('speech is not available');
    expect(html).not.toMatch(/<button[^>]*btn-primary[^>]*disabled=""/);
  });

  test('without speech a clip without audio says why it is off', () => {
    const html = render({ synth: null, local: true, audio: list(['bbbbbbbbbbb2']), createMedia: element });
    expect(html).toContain('speech is not available');
    expect(html).toMatch(/<button[^>]*btn-primary[^>]*disabled=""/);
  });
});

describe('the panel', () => {
  test('the audio row', () => {
    const html = renderToStaticMarkup(<AudioRow audio={{ ...list([]), done: 104, total: 108 }} />);
    expect(html).toContain('104/108 · Ava');
    expect(html).not.toContain('text-warn');
  });

  test('failures and unreadable files show in warn, with a glyph', () => {
    const html = renderToStaticMarkup(<AudioRow audio={{ ...list([]), failed: 3, unreadable: 1 }} />);
    expect(html).toContain('3 failed');
    expect(html).toContain('1 file under another passphrase');
    expect(html).toContain('text-warn');
    expect(html).toContain('✗');
  });

  test('the button: ready, then disabled with live progress', () => {
    const ready = renderToStaticMarkup(<AudioButton audio={list([])} onMake={() => {}} />);
    expect(ready).toContain('>make audio<');
    expect(ready).not.toContain('disabled');
    const busy = renderToStaticMarkup(<AudioButton audio={{ ...list([]), running: true, done: 12, total: 108 }} onMake={() => {}} />);
    expect(busy).toContain('making audio 12/108');
    expect(busy).toContain('disabled');
    expect(busy).not.toContain('btn-primary');
  });
});
