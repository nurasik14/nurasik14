// news.fm laptop audio on the page: which sentence a cue belongs to, and the
// list of clips that have audio. No React and no globals. Only loopback hosts get
// this far: Pages makes no /api request and never builds a source.

/** "en-US-AvaMultilingualNeural" -> "Ava". */
export const voiceLabel = (voice) => /^[a-z]{2}-[A-Z]{2}-(.+?)(?:Multilingual)?Neural$/.exec(voice ?? '')?.[1] ?? voice ?? '';

/** "104/108 · Ava". */
export const audioSummary = (audio) => `${audio.done}/${audio.total} · ${voiceLabel(audio.voice)}`;

const normal = (text) => String(text ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * For each cue, the index of its displayed sentence or null. The engine and the
 * page split sentences on their own, so when the counts differ this goes by text.
 * null when nothing lines up: then there is no highlight at all.
 */
export function mapCues(cues, sentences) {
  if (!cues?.length || !sentences?.length) return null;
  if (cues.length === sentences.length) return cues.map((_, i) => i);
  const texts = sentences.map(normal);
  let at = 0;
  const map = cues.map((cue) => {
    const text = normal(cue.text);
    if (!text) return null;
    for (let i = at; i < texts.length; i += 1) {
      if (texts[i] && (texts[i].includes(text) || text.includes(texts[i]))) {
        at = i;
        return i;
      }
    }
    return null;
  });
  return map.some((i) => i !== null) ? map : null;
}

/** { cues, map } for sentenceAt, or null when the cues cannot be mapped. */
export function clipTiming(cues, sentences) {
  const map = mapCues(cues, sentences);
  return map && { cues, map };
}

/** The sentence playing at `seconds`, or -1 outside every cue (the highlight stays where it is). */
export function sentenceAt(timing, seconds) {
  if (!timing) return -1;
  const i = timing.cues.findIndex((c) => seconds >= c.start && seconds < c.end);
  return i < 0 ? -1 : (timing.map[i] ?? -1);
}

/**
 * What SpeechController needs to play a clip through <audio>. Cues are kept
 * while a clip stays in the list; a clip that leaves it (voice change) may come
 * back different. `preloadEl` is a second, silent element for the next clip.
 */
export function createAudioSource({ ids = [], url, loadCues, preloadEl = null }) {
  let known = new Set(ids);
  let preloaded = null;
  const cueCache = new Map();

  const cues = (id) => {
    if (!cueCache.has(id)) {
      cueCache.set(
        id,
        loadCues(id).catch(() => {
          cueCache.delete(id);
          return null;
        }),
      );
    }
    return cueCache.get(id);
  };

  return {
    setIds(next) {
      known = new Set(next);
      for (const id of cueCache.keys()) if (!known.has(id)) cueCache.delete(id);
    },
    has: (id) => known.has(id),
    url,
    cues,
    preload(id) {
      cues(id);
      if (preloadEl && preloaded !== id) {
        preloaded = id;
        preloadEl.src = url(id);
      }
    },
  };
}
