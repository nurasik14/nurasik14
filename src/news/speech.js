// news.fm speech: sentence splitting, voice choice and a playback controller
// around speechSynthesis and, on localhost, an <audio> element for clips with
// laptop audio. No React and no globals at call time, so tests can inject a fake
// synthesizer and element. See docs/NEWS.md for the platform limits.
import { clipTiming, sentenceAt } from './audio.js';

// Chrome cuts remote voices off after about 15 s, so nothing longer is one utterance.
export const SENTENCE_MAX = 220;
export const CLIP_GAP_MS = 600;
const SETTLE_MS = 60; // some engines drop a speak() issued right after cancel()
const WATCHDOG_MIN_MS = 8000;
const WATCHDOG_MS_PER_CHAR = 150;
const WATCHDOG_RETRY_MS = 5000;
const IMPLAUSIBLE_MS_PER_CHAR = 20; // no voice is this fast: the engine gave up without saying so

// ---------------------------------------------------------------- sentences

const BOUNDARY = /[.!?…]+["'”’)\]»]*(?=\s|$)/g;
const ABBREVIATIONS = new Set(
  'mr mrs ms mx dr prof sr jr st mt vs etc inc ltd llc co corp gov sen rep gen col lt sgt capt cmdr pres dept est approx fig jan feb mar apr jun jul aug sep sept oct nov dec mon tue tues wed thu thur thurs fri'.split(' '),
);

function isBoundary(src, at, end) {
  const next = /^["'“‘([«]*(\S)/.exec(src.slice(end + 1))?.[1];
  if (next && next !== next.toUpperCase()) return false; // `"Really?" she asked.`
  if (src[at] !== '.' || src[at + 1] === '.') return true;
  const word = /[^\s"'“‘([«]+$/.exec(src.slice(0, at))?.[0];
  if (!word) return true;
  if (/^(?:[A-Za-z]\.)+[A-Za-z]$/.test(word)) return false; // U.S., e.g., p.m.
  if (/^[A-Z]$/.test(word)) return false; // an initial: J. K. Rowling
  const lower = word.toLowerCase();
  if (lower === 'no' && /\d/.test(next ?? '')) return false; // No. 5
  return !ABBREVIATIONS.has(lower);
}

/** Splits an over-long sentence at a clause break, or else at a space. */
function breakLong(sentence) {
  const parts = [];
  let rest = sentence;
  while (rest.length > SENTENCE_MAX) {
    const head = rest.slice(0, SENTENCE_MAX);
    const clause = Math.max(...[', ', '; ', ': ', ' — ', ' – '].map((m) => head.lastIndexOf(m) + m.length - 1));
    const space = head.lastIndexOf(' ');
    const cut = clause > SENTENCE_MAX / 2 ? clause : space > 0 ? space : SENTENCE_MAX;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/** Spoken units of a script, in order. Joined by spaces they read as the original prose. */
export function splitSentences(text) {
  const src = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!src) return [];
  const out = [];
  let start = 0;
  for (const m of src.matchAll(BOUNDARY)) {
    const end = m.index + m[0].length;
    if (end < src.length && !isBoundary(src, m.index, end)) continue;
    out.push(src.slice(start, end));
    start = end + 1;
  }
  if (start < src.length) out.push(src.slice(start));
  return out.flatMap(breakLong);
}

// ---------------------------------------------------------------- voices

const QUALITY = ['google', 'natural', 'neural', 'premium', 'enhanced'];
const isEnglish = (v) => /^en([-_]|$)/i.test(v.lang ?? ''); // Android reports en_US
const tier = (v) => {
  const name = (v.name ?? '').toLowerCase();
  const i = QUALITY.findIndex((q) => name.includes(q));
  return i < 0 ? QUALITY.length : i;
};

/** English voices, best first. Equal voices keep the browser's order. */
export const rankVoices = (voices) => voices.filter(isEnglish).sort((a, b) => tier(a) - tier(b));

/** The saved voice if it still exists, else the best English one, else whatever exists. */
export function pickVoice(voices, savedName) {
  return voices.find((v) => v.name === savedName) ?? rankVoices(voices)[0] ?? voices[0] ?? null;
}

// ---------------------------------------------------------------- rate

export const RATE_MIN = 0.8;
export const RATE_MAX = 1.6;
export const RATE_DEFAULT = 1.1;
const round = (r) => Math.round(r * 10) / 10;

export const clampRate = (r) => (Number.isFinite(r) ? round(Math.min(RATE_MAX, Math.max(RATE_MIN, r))) : RATE_DEFAULT);
export const stepRate = (r, direction) => clampRate(r + direction * 0.1);
export const cycleRate = (r) => (r >= RATE_MAX ? RATE_MIN : stepRate(r, 1));
export const rateLabel = (r) => `${r.toFixed(1)}×`;

// ---------------------------------------------------------------- controller

const defaultSchedule = (fn, ms) => {
  const t = setTimeout(fn, ms);
  return () => clearTimeout(t);
};

export const isSpeaking = (status) => status === 'playing' || status === 'gap';

/**
 * One utterance per sentence over a queue of clips [{ id, sentences }].
 * Pause is cancel plus a remembered sentence: speechSynthesis.pause() is
 * unreliable on Android. Status is one of:
 *   idle      nothing started on this clip
 *   playing   a sentence is being spoken
 *   gap       between two clips, the next one is already current
 *   paused    stopped mid-clip, play resumes at `sentence`
 *   ended     clip finished and autoplay is off
 *   finished  the last clip finished
 * Rate and voice changes apply from the next sentence.
 *
 * A clip the `audio` source has (createAudioSource) plays through the one `media`
 * element instead: its sentence follows the cues (-1 until a cue says otherwise,
 * or for good if none can be mapped), pause keeps its position and rate applies at
 * once. A clip whose audio fails falls back to speech without a word. The "false
 * heard" guards below are for speech only: audio that ended has really played.
 */
export class SpeechController {
  constructor({
    synth = globalThis.speechSynthesis,
    Utterance = globalThis.SpeechSynthesisUtterance,
    schedule = defaultSchedule,
    now = Date.now,
    isHidden = () => globalThis.document?.hidden ?? false,
    gapMs = CLIP_GAP_MS,
    rate = RATE_DEFAULT,
    voice = null,
    autoplay = true,
    onClipEnd,
    onMessage,
    media = null,
    audio = null,
  } = {}) {
    Object.assign(this, { synth, Utterance, schedule, now, isHidden, gapMs, rate, voice, autoplay, onClipEnd, onMessage, media, audio });
    this.available = Boolean(synth && Utterance);
    this.engine = null; // 'media' while the element owns the current clip
    this.loaded = null; // the clip id in the element
    this.timing = null; // cues of the loaded clip
    this.broken = new Set(); // clip ids whose audio failed: speech from now on
    if (media) this.#listen(media);
    this.clips = [];
    this.queueId = null;
    this.clip = 0;
    this.sentence = 0;
    this.status = 'idle';
    this.gen = 0; // bumped on every state change; stale engine callbacks compare against it
    this.timer = null;
    this.watchdog = null;
    this.current = null; // a strong reference: Chrome can GC a live utterance and lose its `end`
    this.listeners = new Set();
    this.snapshot = this.#snap();
  }

  // For useSyncExternalStore, so these two stay bound.
  subscribe = (fn) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snapshot;

  #snap() {
    return { status: this.status, clip: this.clip, sentence: this.sentence, queueId: this.queueId };
  }

  #emit() {
    this.snapshot = this.#snap();
    for (const fn of this.listeners) fn();
  }

  #set(status) {
    this.status = status;
    this.#emit();
  }

  /** Stops the engine and every pending callback. True when the engine was busy. */
  #cancel() {
    this.gen += 1;
    this.timer?.();
    this.timer = null;
    this.watchdog?.();
    this.watchdog = null;
    this.current = null;
    if (this.media && !this.media.paused) this.media.pause();
    if (!this.available) return false;
    const busy = Boolean(this.synth.speaking || this.synth.pending || this.synth.paused);
    if (busy) this.synth.cancel();
    return busy;
  }

  // Must stay synchronous when the engine is idle: on iOS and Android the
  // first speak() has to run inside the user's gesture. So must media.play().
  #begin(afterCancel) {
    if (!afterCancel || this.usesAudio(this.clips[this.clip])) {
      this.status = 'playing';
      this.#speak();
      return;
    }
    const gen = this.gen;
    this.timer = this.schedule(() => {
      this.timer = null;
      if (gen === this.gen) this.#speak();
    }, SETTLE_MS);
    this.#set('playing');
  }

  #speak() {
    const clip = this.clips[this.clip];
    if (this.usesAudio(clip)) {
      this.#playMedia(clip);
      return;
    }
    this.sentence = Math.max(this.sentence, 0);
    this.#say();
  }

  #playMedia(clip) {
    this.gen += 1;
    const gen = this.gen;
    const { media } = this;
    this.engine = 'media';
    if (this.loaded !== clip.id) {
      this.loaded = clip.id;
      this.timing = null;
      this.sentence = -1;
      // Loading resets playbackRate to this.
      media.defaultPlaybackRate = this.rate;
      media.src = this.audio.url(clip.id);
    }
    media.preservesPitch = true;
    media.playbackRate = this.rate;
    if (!this.timing) {
      this.audio.cues(clip.id).then((cues) => {
        if (gen !== this.gen) return;
        this.timing = clipTiming(cues, clip.sentences);
        this.#followCues();
      });
    }
    media.play()?.catch?.((err) => {
      if (gen !== this.gen || err?.name === 'AbortError') return;
      if (err?.name === 'NotAllowedError') this.#halt('the browser blocked audio · press play');
      else this.#mediaFailed();
    });
    const next = this.clips[this.clip + 1];
    if (this.usesAudio(next)) this.audio.preload(next.id);
    this.#emit();
  }

  #listen(media) {
    media.addEventListener('timeupdate', () => {
      if (this.engine === 'media') this.#followCues();
    });
    media.addEventListener('ended', () => {
      if (this.engine !== 'media' || this.status !== 'playing') return;
      this.gen += 1;
      this.#forgetMedia();
      this.#clipDone();
    });
    media.addEventListener('error', () => {
      if (this.engine === 'media') this.#mediaFailed();
    });
    // Headphones pulled, another app taking the audio. `pause` also fires right before `ended`.
    media.addEventListener('pause', () => {
      if (this.engine === 'media' && this.status === 'playing' && media.paused && !media.ended) {
        this.gen += 1;
        this.#set('paused');
      }
    });
    media.addEventListener('play', () => {
      if (this.engine === 'media' && this.status === 'paused' && !media.paused) this.#set('playing');
    });
  }

  #followCues() {
    const sentence = sentenceAt(this.timing, this.media.currentTime);
    if (sentence >= 0 && sentence !== this.sentence) {
      this.sentence = sentence;
      this.#emit();
    }
  }

  #forgetMedia() {
    this.engine = null;
    this.loaded = null;
    this.timing = null;
  }

  // 404, a corrupt file, a dead server. The clip carries on as speech, unannounced.
  #mediaFailed() {
    this.broken.add(this.clips[this.clip]?.id);
    this.#forgetMedia();
    this.sentence = Math.max(this.sentence, 0);
    if (this.status === 'playing') this.#say();
    else this.#emit();
  }

  #say() {
    this.engine = null;
    const text = this.clips[this.clip]?.sentences[this.sentence];
    if (!text) {
      this.#clipDone();
      return;
    }
    // Reachable on the way from a clip with audio to one without.
    if (!this.available) {
      this.#halt('this clip has no audio and there is no device voice');
      return;
    }
    this.gen += 1;
    const gen = this.gen;
    const u = new this.Utterance(text);
    u.rate = this.rate;
    u.lang = this.voice?.lang ?? 'en-US';
    if (this.voice) u.voice = this.voice;
    const startedAt = this.now();
    u.onend = () => {
      if (gen === this.gen) this.#sentenceEnded(text, startedAt);
    };
    u.onerror = (e) => {
      if (gen === this.gen) this.#failed(e?.error);
    };
    this.current = u;
    if (this.synth.paused) this.synth.resume();
    this.synth.speak(u);
    this.#armWatchdog(gen, WATCHDOG_MIN_MS + (text.length * WATCHDOG_MS_PER_CHAR) / this.rate);
    this.#emit();
  }

  // `end` can go missing, and on a locked phone the engine can stop without a
  // word. Never advance from here: that would mark unheard clips as heard.
  #armWatchdog(gen, ms) {
    this.watchdog?.();
    this.watchdog = this.schedule(() => {
      this.watchdog = null;
      if (gen !== this.gen) return;
      if (this.synth.speaking || this.synth.pending) this.#armWatchdog(gen, WATCHDOG_RETRY_MS);
      else this.#halt('speech stopped · press play to resume');
    }, ms);
  }

  #sentenceEnded(text, startedAt) {
    this.gen += 1;
    this.watchdog?.();
    this.watchdog = null;
    // A locked phone can end utterances at once. Do not race through the queue.
    if (this.isHidden() && this.now() - startedAt < (text.length * IMPLAUSIBLE_MS_PER_CHAR) / this.rate) {
      this.#halt('speech stopped while the page was hidden · press play to resume');
      return;
    }
    if (this.sentence + 1 < (this.clips[this.clip]?.sentences.length ?? 0)) {
      this.sentence += 1;
      this.#say();
    } else {
      this.#clipDone();
    }
  }

  #clipDone() {
    const clip = this.clips[this.clip];
    this.current = null;
    this.sentence = 0;
    this.onClipEnd?.(clip, this.clip, this.queueId);
    if (this.clip >= this.clips.length - 1) {
      this.#set('finished');
    } else if (!this.autoplay) {
      this.#set('ended');
    } else {
      this.clip += 1;
      const gen = this.gen;
      this.timer = this.schedule(() => {
        this.timer = null;
        if (gen !== this.gen) return;
        this.status = 'playing';
        this.#speak();
      }, this.gapMs);
      this.#set('gap');
    }
  }

  #failed(error) {
    if (error === 'interrupted' || error === 'canceled') this.#halt('speech interrupted · press play to resume');
    else if (error === 'not-allowed') this.#halt('the browser blocked speech · press play');
    else this.#halt(`speech failed (${error ?? 'unknown'}) · try another voice in settings`);
  }

  #halt(message) {
    this.#cancel();
    this.#set('paused');
    this.onMessage?.(message);
  }

  /** Replaces the queue. Whatever was speaking stops. */
  setQueue(clips, index = 0, id = null) {
    this.#cancel();
    this.#forgetMedia();
    this.clips = clips;
    this.queueId = id;
    this.clip = Math.max(0, Math.min(index, clips.length - 1));
    this.sentence = 0;
    this.#set('idle');
  }

  /** True when this clip would play through the <audio> element. */
  usesAudio(clip) {
    return Boolean(clip && this.media && this.audio?.has(clip.id) && !this.broken.has(clip.id));
  }

  play() {
    const clip = this.clips[this.clip];
    if (!clip || isSpeaking(this.status) || !(this.available || this.usesAudio(clip))) return;
    if (this.status === 'ended' || this.status === 'finished') this.sentence = 0;
    this.#begin(this.#cancel());
  }

  pause() {
    if (!isSpeaking(this.status)) return;
    this.#cancel();
    this.#set('paused');
  }

  toggle() {
    if (isSpeaking(this.status)) this.pause();
    else this.play();
  }

  /** Moves to a clip. Keeps speaking if it was speaking, otherwise stays quiet. */
  goTo(index) {
    if (!this.clips[index]) return false;
    const live = isSpeaking(this.status);
    const busy = this.#cancel();
    this.#forgetMedia();
    this.clip = index;
    this.sentence = 0;
    if (live) this.#begin(busy);
    else this.#set('idle');
    return true;
  }

  next() {
    return this.goTo(this.clip + 1);
  }

  prev() {
    return this.goTo(this.clip - 1);
  }

  setHandlers({ onClipEnd, onMessage }) {
    this.onClipEnd = onClipEnd;
    this.onMessage = onMessage;
  }

  setRate(rate) {
    this.rate = rate;
    if (this.media) {
      this.media.defaultPlaybackRate = rate;
      this.media.playbackRate = rate;
    }
  }

  /** A new list of clips with audio. Whatever is playing carries on. */
  setAudio(audio) {
    this.audio = audio;
    this.#emit();
  }

  setVoice(voice) {
    this.voice = voice;
  }

  setAutoplay(on) {
    this.autoplay = on;
  }

  /** When the page comes back: speech may have died while it was hidden. */
  recheck() {
    if (this.engine === 'media' || this.status !== 'playing' || this.timer || !this.available) return;
    if (!this.synth.speaking && !this.synth.pending) this.#halt('speech stopped while the page was hidden · press play to resume');
  }
}
