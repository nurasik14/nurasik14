import { describe, expect, test } from 'bun:test';
import { clampRate, cycleRate, isSpeaking, pickVoice, rankVoices, rateLabel, SENTENCE_MAX, SpeechController, splitSentences, stepRate } from '../../src/news/speech.js';

describe('splitSentences', () => {
  test('plain endings', () => {
    expect(splitSentences('One here. Two here! Three here? Four here.')).toEqual(['One here.', 'Two here!', 'Three here?', 'Four here.']);
  });

  test('abbreviations do not end a sentence', () => {
    expect(splitSentences('The U.S. Senate voted. Dr. Smith of Acme Inc. Limited agreed, e.g. on tax.')).toEqual(['The U.S. Senate voted.', 'Dr. Smith of Acme Inc. Limited agreed, e.g. on tax.']);
    expect(splitSentences('Rates fell in the U.K. economy at 5 p.m. local time.')).toEqual(['Rates fell in the U.K. economy at 5 p.m. local time.']);
    expect(splitSentences('J. K. Rowling spoke on Jan. 5 about it. It went well.')).toEqual(['J. K. Rowling spoke on Jan. 5 about it.', 'It went well.']);
    expect(splitSentences('It is listed as No. 5 this year. He said no. Then he left.')).toEqual(['It is listed as No. 5 this year.', 'He said no.', 'Then he left.']);
  });

  test('decimals and domains stay whole', () => {
    expect(splitSentences('Growth was 3.5 percent. Shares rose 1.25 points on example.com today.')).toEqual(['Growth was 3.5 percent.', 'Shares rose 1.25 points on example.com today.']);
  });

  test('quotes', () => {
    expect(splitSentences('He said "no." Then he left.')).toEqual(['He said "no."', 'Then he left.']);
    expect(splitSentences('"Really?" she asked. "Yes!" He nodded.')).toEqual(['"Really?" she asked.', '"Yes!"', 'He nodded.']);
    expect(splitSentences('She wrote “done.” “Good,” he said.')).toEqual(['She wrote “done.”', '“Good,” he said.']);
  });

  test('ellipsis, missing end, whitespace, empty', () => {
    expect(splitSentences('Well... maybe not. Fine… Next one')).toEqual(['Well... maybe not.', 'Fine…', 'Next one']);
    expect(splitSentences('  a  b\n c.  ')).toEqual(['a b c.']);
    expect(splitSentences('')).toEqual([]);
    expect(splitSentences(null)).toEqual([]);
  });

  test('a very long sentence breaks at a clause, and nothing is lost', () => {
    const long = `${'word '.repeat(30).trim()}, ${'more '.repeat(60).trim()}.`;
    const parts = splitSentences(long);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= SENTENCE_MAX)).toBe(true);
    expect(parts.join(' ')).toBe(long);
    const unbroken = 'x'.repeat(SENTENCE_MAX * 2 + 5);
    expect(splitSentences(unbroken).join('')).toBe(unbroken);
  });

  test('joined sentences read as the original prose', () => {
    const script = 'The U.S. economy grew 3.5 percent. "Great," he said! Would it last? Nobody knows.';
    expect(splitSentences(script).join(' ')).toBe(script);
  });
});

describe('voices', () => {
  const voices = [
    { name: 'Samantha', lang: 'en-US' },
    { name: 'Thomas', lang: 'fr-FR' },
    { name: 'Daniel (Enhanced)', lang: 'en-GB' },
    { name: 'Google Deutsch', lang: 'de-DE' },
    { name: 'Google US English', lang: 'en-US' },
    { name: 'Microsoft Aria Online (Natural)', lang: 'en-US' },
    { name: 'English United States', lang: 'en_US' },
  ];

  test('ranks English quality voices first, English only', () => {
    expect(rankVoices(voices).map((v) => v.name)).toEqual(['Google US English', 'Microsoft Aria Online (Natural)', 'Daniel (Enhanced)', 'Samantha', 'English United States']);
  });

  test('the saved voice wins while it exists', () => {
    expect(pickVoice(voices, 'Samantha').name).toBe('Samantha');
    expect(pickVoice(voices, 'gone').name).toBe('Google US English');
    expect(pickVoice(voices).name).toBe('Google US English');
  });

  test('falls back to any voice, then to none', () => {
    expect(pickVoice([{ name: 'Thomas', lang: 'fr-FR' }]).name).toBe('Thomas');
    expect(pickVoice([])).toBeNull();
  });
});

test('rate helpers stay in 0.8–1.6 in 0.1 steps', () => {
  expect(stepRate(1.1, 1)).toBe(1.2);
  expect(stepRate(1.6, 1)).toBe(1.6);
  expect(stepRate(0.8, -1)).toBe(0.8);
  expect(cycleRate(1.5)).toBe(1.6);
  expect(cycleRate(1.6)).toBe(0.8);
  expect(clampRate(9)).toBe(1.6);
  expect(clampRate('x')).toBe(1.1);
  expect(rateLabel(1.1)).toBe('1.1×');
});

// ---------------------------------------------------------------- controller

class FakeUtterance {
  constructor(text) {
    this.text = text;
  }
}

class FakeSynth {
  speaking = false;
  pending = false;
  paused = false;
  spoken = [];
  cancels = 0;
  current = null;

  speak(u) {
    this.spoken.push(u);
    this.current = u;
    this.speaking = true;
  }

  // Like Chrome: cancel fires the canceled utterance's error handler.
  cancel() {
    this.cancels += 1;
    const u = this.current;
    this.current = null;
    this.speaking = false;
    u?.onerror?.({ error: 'canceled' });
  }

  resume() {
    this.paused = false;
  }

  finish() {
    const u = this.current;
    this.current = null;
    this.speaking = false;
    u.onend?.();
  }

  get texts() {
    return this.spoken.map((u) => u.text);
  }
}

function setup(options = {}) {
  const synth = new FakeSynth();
  const timers = [];
  const ended = [];
  const messages = [];
  let clock = 0;
  const controller = new SpeechController({
    synth,
    Utterance: FakeUtterance,
    schedule: (fn, ms) => {
      const t = { fn, ms };
      timers.push(t);
      return () => timers.splice(timers.indexOf(t), 1);
    },
    now: () => clock,
    isHidden: () => false,
    onClipEnd: (clip, index, queueId) => ended.push([clip.id, index, queueId]),
    onMessage: (m) => messages.push(m),
    ...options,
  });
  const run = (ms) => {
    const due = timers.filter((t) => t.ms === ms);
    for (const t of due) {
      timers.splice(timers.indexOf(t), 1);
      t.fn();
    }
    return due.length;
  };
  return { synth, timers, ended, messages, controller, run, tick: (ms) => (clock += ms) };
}

const clips = [
  { id: 'a', sentences: ['a1', 'a2'] },
  { id: 'b', sentences: ['b1'] },
  { id: 'c', sentences: ['c1', 'c2'] },
];
const SETTLE = 60;
const GAP = 600;

describe('SpeechController', () => {
  test('speaks sentences in order, synchronously on the first play', () => {
    const { synth, controller } = setup();
    controller.setQueue(clips, 0, 'w');
    expect(controller.getSnapshot()).toEqual({ status: 'idle', clip: 0, sentence: 0, queueId: 'w' });
    controller.play();
    // Inside the user's gesture: no timer between the click and speak().
    expect(synth.texts).toEqual(['a1']);
    expect(controller.getSnapshot().status).toBe('playing');
    synth.finish();
    expect(synth.texts).toEqual(['a1', 'a2']);
    expect(controller.getSnapshot().sentence).toBe(1);
  });

  test('pause cancels and resume starts the same sentence again', () => {
    const { synth, controller, run } = setup();
    controller.setQueue(clips);
    controller.play();
    synth.finish();
    controller.pause();
    expect(synth.cancels).toBe(1);
    expect(controller.getSnapshot()).toMatchObject({ status: 'paused', sentence: 1 });
    // The canceled utterance's late callbacks are ignored.
    synth.spoken.at(-1).onend();
    expect(controller.getSnapshot()).toMatchObject({ status: 'paused', sentence: 1 });
    controller.play();
    run(SETTLE);
    expect(synth.texts).toEqual(['a1', 'a2', 'a2']);
    expect(controller.getSnapshot()).toMatchObject({ status: 'playing', sentence: 1 });
  });

  test('toggle flips between the two', () => {
    const { synth, controller } = setup();
    controller.setQueue(clips);
    controller.toggle();
    expect(isSpeaking(controller.getSnapshot().status)).toBe(true);
    controller.toggle();
    expect(controller.getSnapshot().status).toBe('paused');
    expect(synth.speaking).toBe(false);
  });

  test('next and prev cancel and keep speaking, after a settle delay', () => {
    const { synth, controller, run, ended } = setup();
    controller.setQueue(clips);
    controller.play();
    controller.next();
    expect(synth.cancels).toBe(1);
    expect(controller.getSnapshot()).toMatchObject({ status: 'playing', clip: 1, sentence: 0 });
    expect(synth.texts).toEqual(['a1']);
    run(SETTLE);
    expect(synth.texts).toEqual(['a1', 'b1']);
    controller.prev();
    expect(synth.cancels).toBe(2);
    run(SETTLE);
    expect(synth.texts).toEqual(['a1', 'b1', 'a1']);
    // Skipping is not hearing.
    expect(ended).toEqual([]);
  });

  test('next while quiet moves without speaking; the ends of the queue do nothing', () => {
    const { synth, controller } = setup();
    controller.setQueue(clips);
    expect(controller.prev()).toBe(false);
    expect(controller.next()).toBe(true);
    expect(controller.getSnapshot()).toMatchObject({ status: 'idle', clip: 1 });
    expect(synth.spoken).toEqual([]);
    controller.next();
    expect(controller.next()).toBe(false);
    expect(controller.getSnapshot().clip).toBe(2);
  });

  test('a finished clip fires onClipEnd once, then the next starts after the gap', () => {
    const { synth, controller, ended, run } = setup();
    controller.setQueue(clips, 0, 'w');
    controller.play();
    synth.finish();
    const last = synth.current;
    synth.finish();
    // A duplicate `end` from the engine changes nothing.
    last.onend();
    expect(ended).toEqual([['a', 0, 'w']]);
    expect(controller.getSnapshot()).toMatchObject({ status: 'gap', clip: 1, sentence: 0 });
    expect(synth.texts).toEqual(['a1', 'a2']);
    expect(run(GAP)).toBe(1);
    expect(synth.texts).toEqual(['a1', 'a2', 'b1']);
    expect(controller.getSnapshot().status).toBe('playing');
  });

  test('pausing in the gap holds the next clip', () => {
    const { synth, controller, run, timers } = setup();
    controller.setQueue(clips, 1);
    controller.play();
    synth.finish();
    expect(controller.getSnapshot()).toMatchObject({ status: 'gap', clip: 2 });
    controller.pause();
    expect(timers.filter((t) => t.ms === GAP)).toEqual([]);
    expect(run(GAP)).toBe(0);
    expect(controller.getSnapshot()).toMatchObject({ status: 'paused', clip: 2, sentence: 0 });
    expect(synth.texts).toEqual(['b1']);
  });

  test('the last clip finishes the queue and play starts it again', () => {
    const { synth, controller, ended } = setup();
    controller.setQueue(clips, 2);
    controller.play();
    synth.finish();
    synth.finish();
    expect(controller.getSnapshot()).toMatchObject({ status: 'finished', clip: 2, sentence: 0 });
    expect(ended).toHaveLength(1);
    controller.play();
    expect(synth.texts.at(-1)).toBe('c1');
  });

  test('autoplay off stays on the clip', () => {
    const { synth, controller, ended, timers } = setup({ autoplay: false });
    controller.setQueue(clips, 1);
    controller.play();
    synth.finish();
    expect(ended).toHaveLength(1);
    expect(controller.getSnapshot()).toMatchObject({ status: 'ended', clip: 1 });
    expect(timers.filter((t) => t.ms === GAP)).toEqual([]);
  });

  test('rate and voice reach the utterance, changes apply from the next sentence', () => {
    const voice = { name: 'Samantha', lang: 'en-GB' };
    const { synth, controller } = setup({ rate: 1.3 });
    controller.setQueue(clips);
    controller.setVoice(voice);
    controller.play();
    expect(synth.current.rate).toBe(1.3);
    expect(synth.current.voice).toBe(voice);
    expect(synth.current.lang).toBe('en-GB');
    controller.setRate(0.9);
    expect(synth.current.rate).toBe(1.3);
    synth.finish();
    expect(synth.current.rate).toBe(0.9);
  });

  test('an engine interruption pauses at the same sentence', () => {
    const { synth, controller, messages, run } = setup();
    controller.setQueue(clips);
    controller.play();
    synth.finish();
    synth.current.onerror({ error: 'interrupted' });
    expect(controller.getSnapshot()).toMatchObject({ status: 'paused', sentence: 1 });
    expect(messages[0]).toMatch(/interrupted/);
    controller.play();
    run(SETTLE);
    expect(synth.texts.at(-1)).toBe('a2');
  });

  test('other engine errors pause with a reason', () => {
    const { synth, controller, messages, ended } = setup();
    controller.setQueue(clips);
    controller.play();
    synth.current.onerror({ error: 'synthesis-failed' });
    expect(controller.getSnapshot().status).toBe('paused');
    expect(messages[0]).toMatch(/synthesis-failed/);
    expect(ended).toEqual([]);
  });

  test('a lost end never advances: the watchdog pauses instead', () => {
    const { synth, controller, timers, messages, ended } = setup();
    controller.setQueue(clips);
    controller.play();
    const watchdog = timers.at(-1);
    synth.speaking = true;
    watchdog.fn();
    expect(controller.getSnapshot().status).toBe('playing');
    // Still speaking, so it looks again later.
    synth.speaking = false;
    synth.current = null;
    timers.at(-1).fn();
    expect(controller.getSnapshot()).toMatchObject({ status: 'paused', sentence: 0 });
    expect(messages[0]).toMatch(/stopped/);
    expect(ended).toEqual([]);
  });

  test('instant ends on a hidden page do not mark clips as heard', () => {
    let hidden = false;
    const { synth, controller, ended, messages, tick } = setup({ isHidden: () => hidden });
    controller.setQueue([{ id: 'x', sentences: ['A long enough sentence to take a while.'] }]);
    controller.play();
    hidden = true;
    synth.finish();
    expect(controller.getSnapshot().status).toBe('paused');
    expect(ended).toEqual([]);
    expect(messages[0]).toMatch(/hidden/);

    // A real end while hidden (desktop tab switch) still counts.
    controller.play();
    tick(60_000);
    synth.current.onend();
    expect(ended).toHaveLength(1);
  });

  test('recheck pauses when speech died in the background', () => {
    const { synth, controller, messages } = setup();
    controller.setQueue(clips);
    controller.play();
    controller.recheck();
    expect(controller.getSnapshot().status).toBe('playing');
    synth.speaking = false;
    controller.recheck();
    expect(controller.getSnapshot().status).toBe('paused');
    expect(messages).toHaveLength(1);
  });

  test('setQueue stops what was speaking and notifies subscribers', () => {
    const { synth, controller } = setup();
    let calls = 0;
    const off = controller.subscribe(() => {
      calls += 1;
    });
    controller.setQueue(clips);
    controller.play();
    const before = calls;
    controller.setQueue(clips, 2, 'other');
    expect(synth.speaking).toBe(false);
    expect(controller.getSnapshot()).toEqual({ status: 'idle', clip: 2, sentence: 0, queueId: 'other' });
    expect(calls).toBeGreaterThan(before);
    off();
    controller.next();
    expect(calls).toBe(before + 1);
  });

  test('without speechSynthesis it holds the queue and stays quiet', () => {
    const controller = new SpeechController({ synth: undefined, Utterance: undefined });
    expect(controller.available).toBe(false);
    controller.setQueue(clips, 1, 'w');
    controller.play();
    expect(controller.getSnapshot()).toEqual({ status: 'idle', clip: 1, sentence: 0, queueId: 'w' });
    controller.next();
    expect(controller.getSnapshot().clip).toBe(2);
    controller.recheck();
  });
});
