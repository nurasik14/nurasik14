import React from 'react';
import { WrongPassphraseError } from '../../plugins/news-core.js';
import { useCommands, useShell } from '../shell/AppShell';
import { isTypingTarget, scrollToId } from '../lib/nav';
import { createAudioSource, voiceLabel } from './audio.js';
import { clampRate, cycleRate, isSpeaking, pickVoice, RATE_MAX, RATE_MIN, rankVoices, rateLabel, SpeechController, stepRate } from './speech.js';
import {
  audioCues,
  audioUrl,
  chooseWrapUp,
  findClip,
  formatReceived,
  heardCount,
  markHeard,
  newsUrl,
  nextUnheardWrapUp,
  openWrapUp,
  readNewsUrl,
  readProgress,
  readSettings,
  resumeIndex,
  safeStorage,
  setLastClip,
  swipeAction,
  writeProgress,
  writeSettings,
} from './store.js';

const VOICE_POLL_MS = 250;
const VOICE_POLLS = 12;

/**
 * Decrypts the other wrap-ups one at a time, newest first. Each file has its
 * own salt, so each costs a full key derivation; `prioritize` moves one to the
 * front of the line when it is selected. Results stay in memory only.
 */
function useLibrary(entries, passphrase, first) {
  const [lib, setLib] = React.useState(() => ({ [entries[0].id]: first }));
  const libRef = React.useRef(lib);
  const priorityRef = React.useRef([]);
  const wakeRef = React.useRef(null);

  const update = React.useCallback((id, value) => {
    libRef.current = { ...libRef.current, [id]: value };
    setLib(libRef.current);
  }, []);

  React.useEffect(() => {
    let live = true;
    // 'loading' counts as to do: only a worker cleaned up mid-file can leave it behind.
    const isDone = (id) => {
      const status = libRef.current[id]?.status;
      return status === 'ready' || status === 'error';
    };
    const nextId = () => {
      priorityRef.current = priorityRef.current.filter((id) => !isDone(id));
      return priorityRef.current[0] ?? entries.find((e) => !isDone(e.id))?.id ?? null;
    };
    (async () => {
      while (live) {
        const id = nextId();
        if (!id) {
          await new Promise((resolve) => {
            wakeRef.current = resolve;
          });
          continue;
        }
        update(id, { status: 'loading' });
        try {
          const wrapUp = await openWrapUp(id, passphrase);
          if (live) update(id, wrapUp);
        } catch (err) {
          if (live) update(id, { status: 'error', wrongPassphrase: err instanceof WrongPassphraseError, error: err.message });
        }
      }
    })();
    return () => {
      live = false;
      wakeRef.current?.();
    };
  }, [entries, passphrase, update]);

  const prioritize = React.useCallback(
    (id) => {
      if (libRef.current[id]?.status === 'error') update(id, undefined);
      priorityRef.current = [id, ...priorityRef.current.filter((x) => x !== id)];
      wakeRef.current?.();
    },
    [update],
  );

  return { lib, prioritize };
}

/** { phase: 'unavailable' | 'loading' | 'none' | 'ready', voices }. Voices can arrive late or without an event. */
function useVoices(synth) {
  const [state, setState] = React.useState(() => {
    if (!synth) return { phase: 'unavailable', voices: [] };
    const voices = synth.getVoices();
    return { phase: voices.length ? 'ready' : 'loading', voices };
  });
  React.useEffect(() => {
    if (!synth) return undefined;
    let tries = 0;
    let timer;
    const update = () => {
      const voices = synth.getVoices();
      if (voices.length) setState({ phase: 'ready', voices: [...voices] });
      return voices.length > 0;
    };
    const poll = () => {
      if (update()) return;
      tries += 1;
      if (tries >= VOICE_POLLS) setState((s) => (s.voices.length ? s : { phase: 'none', voices: [] }));
      else timer = setTimeout(poll, VOICE_POLL_MS);
    };
    poll();
    synth.addEventListener?.('voiceschanged', update);
    return () => {
      clearTimeout(timer);
      synth.removeEventListener?.('voiceschanged', update);
    };
  }, [synth]);
  return state;
}

const SPEECH_REASON = {
  unavailable: 'speech is not available in this browser · clips are text only',
  none: 'no speech voices on this device · clips are text only',
  loading: 'loading voices…',
};

function WrapUpRow({ entry, wrapUp, progress, current, onSelect }) {
  let count;
  if (wrapUp?.status === 'ready') {
    const total = wrapUp.stories.length;
    const heard = heardCount(wrapUp.stories, progress, entry.id);
    count = !total ? (
      <span className="text-fg-faint">no clips</span>
    ) : (
      <span className={heard === total ? 'text-ok' : 'text-fg-dim'}>
        {heard === total && <span aria-hidden="true">✓ </span>}
        {heard}/{total} heard
      </span>
    );
  } else if (wrapUp?.status === 'error') {
    count = (
      <span className="text-warn">
        <span aria-hidden="true">✗ </span>
        {wrapUp.wrongPassphrase ? 'other passphrase' : 'failed'}
      </span>
    );
  } else {
    count = <span className="text-fg-faint">{wrapUp?.status === 'loading' ? 'deriving key…' : 'queued'}</span>;
  }
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(entry.id)}
        aria-current={current ? 'true' : undefined}
        className={`grid min-h-11 w-full grid-cols-[1ch_minmax(0,1fr)_auto] items-baseline gap-x-2 rounded px-2 py-2 text-left font-mono text-[13px] transition-colors hover:bg-surface-2 ${
          current ? 'bg-surface text-fg' : 'text-fg-dim'
        }`}
      >
        <span aria-hidden="true" className="text-signal">
          {current ? '▌' : ''}
        </span>
        <span className="min-w-0 break-words">{entry.label}</span>
        <span className="whitespace-nowrap text-[12px]">{count}</span>
      </button>
    </li>
  );
}

function Settings({ voices, voice, settings, onVoice, onRate, onAutoplay, laptopVoice }) {
  const options = React.useMemo(() => {
    const english = rankVoices(voices);
    return english.length ? english : voices;
  }, [voices]);
  return (
    <details className="group mt-6 rounded border border-line font-mono text-[13px]">
      <summary className="cursor-pointer list-none px-3 py-2 text-fg-dim hover:text-fg [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="inline-block w-3 text-fg-faint transition-transform duration-150 ease-out group-open:rotate-90 motion-reduce:transition-none">
          ›
        </span>
        settings
      </summary>
      <div className="space-y-4 border-t border-line-soft px-3 py-3">
        {laptopVoice && <p className="break-words text-fg-dim">laptop audio: {laptopVoice}</p>}
        <div>
          <label htmlFor="news-voice" className="block text-fg-dim">
            {laptopVoice ? 'device voice, for clips without laptop audio' : 'voice'}
          </label>
          <select id="news-voice" className="field mt-1" value={voice?.name ?? ''} onChange={(e) => onVoice(e.target.value)} disabled={!options.length}>
            {!options.length && <option value="">no voices</option>}
            {options.map((v) => (
              <option key={v.voiceURI ?? v.name} value={v.name}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </div>
        <div>
          <span id="news-rate-label" className="block text-fg-dim">
            speed
          </span>
          <div role="group" aria-labelledby="news-rate-label" className="mt-1 flex items-center gap-3">
            <button type="button" className="btn h-9 w-9 justify-center px-0" aria-label="slower" onClick={() => onRate(stepRate(settings.rate, -1))} disabled={settings.rate <= RATE_MIN}>
              −
            </button>
            <output className="w-[5ch] text-center text-fg">{rateLabel(settings.rate)}</output>
            <button type="button" className="btn h-9 w-9 justify-center px-0" aria-label="faster" onClick={() => onRate(stepRate(settings.rate, 1))} disabled={settings.rate >= RATE_MAX}>
              +
            </button>
          </div>
          <p className="mt-1 text-[12px] text-fg-faint">{laptopVoice ? 'laptop audio changes speed at once, the device voice from the next sentence' : 'voice and speed apply from the next sentence'}</p>
        </div>
        <label className="flex cursor-pointer items-center gap-2.5 text-fg-dim">
          <input type="checkbox" checked={settings.autoplay} onChange={(e) => onAutoplay(e.target.checked)} className="h-4 w-4 shrink-0 accent-info" />
          autoplay the next clip
        </label>
      </div>
    </details>
  );
}

/** What to open with no wrap-up named: a linked clip's, once found, else the usual choice. null means wait. */
function automaticSelection(entries, lib, progress, clipId) {
  if (clipId) {
    const found = findClip(entries, lib, clipId);
    if (found) return found.id;
    if (entries.some((e) => !['ready', 'error'].includes(lib[e.id]?.status))) return null;
  }
  return chooseWrapUp(entries, lib, progress);
}

const newMediaElement = () => (globalThis.Audio ? new globalThis.Audio() : null);

/** The <audio> element that plays laptop audio, and the source for it. Neither exists on Pages. */
function createLaptopAudio(local, ids, createMedia) {
  const media = local ? createMedia() : null;
  if (!media) return { media: null, source: null };
  const preloadEl = createMedia();
  if (preloadEl) preloadEl.preload = 'auto';
  return { media, source: createAudioSource({ ids, url: audioUrl, loadCues: audioCues, preloadEl }) };
}

export default function Player({ entries, first, passphrase, onLock, synth = globalThis.speechSynthesis, local = false, audio = null, createMedia = newMediaElement }) {
  const { setMode, flash } = useShell();
  const [storage] = React.useState(safeStorage);
  const [url] = React.useState(() => readNewsUrl(globalThis.location?.href));
  const { lib, prioritize } = useLibrary(entries, passphrase, first);
  const libRef = React.useRef(lib);
  const [progress, setProgress] = React.useState(() => readProgress(storage));
  const progressRef = React.useRef(progress);
  const [settings, setSettings] = React.useState(() => readSettings(storage));
  const speech = useVoices(synth);
  const canSpeak = speech.phase === 'ready';
  const voice = React.useMemo(() => pickVoice(speech.voices, settings.voice), [speech.voices, settings.voice]);

  const [selected, setSelected] = React.useState(() =>
    url.week && entries.some((e) => e.id === url.week) ? url.week : automaticSelection(entries, lib, progress, url.clipId),
  );
  // Chosen as wrap-ups finish decrypting, during render, as the planner adjusts its month. Then it stays put.
  if (!selected) {
    const id = automaticSelection(entries, lib, progress, url.clipId);
    if (id) setSelected(id);
  }
  const wantedClip = React.useRef(url.clipId);
  const playOnAttach = React.useRef(false);

  const [laptop] = React.useState(() => createLaptopAudio(local, audio?.ids, createMedia));
  const [controller] = React.useState(() => {
    const c = new SpeechController({ synth, rate: settings.rate, autoplay: settings.autoplay, media: laptop.media, audio: laptop.source });
    // Attached here too so the first render already shows the clip.
    const stories = selected && lib[selected]?.stories;
    if (stories) {
      const wanted = stories.findIndex((s) => s.id === url.clipId);
      c.setQueue(stories, wanted >= 0 ? wanted : resumeIndex(stories, progress, selected), selected);
    }
    return c;
  });
  const snap = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  const wrapUp = selected ? lib[selected] : null;
  const attached = wrapUp?.status === 'ready' && snap.queueId === selected;
  const clips = attached ? wrapUp.stories : [];
  const clip = clips[snap.clip] ?? null;
  const speaking = isSpeaking(snap.status);
  const selectedEntry = entries.find((e) => e.id === selected) ?? null;
  const clipHasAudio = controller.usesAudio(clip);
  const canPlay = canSpeak || clipHasAudio;

  React.useEffect(() => {
    if (!laptop.source) return;
    laptop.source.setIds(audio?.ids ?? []);
    controller.setAudio(laptop.source);
  }, [audio, laptop, controller]);

  // Lock screen and media keys, only where laptop audio can play. Pages never gets here.
  const session = laptop.source && audio ? globalThis.navigator?.mediaSession : null;
  React.useEffect(() => {
    if (!session) return undefined;
    const handlers = { play: () => controller.play(), pause: () => controller.pause(), previoustrack: () => controller.prev(), nexttrack: () => controller.next() };
    const assign = (action, fn) => {
      try {
        session.setActionHandler(action, fn);
      } catch {
        // A browser that does not know this action.
      }
    };
    for (const [action, fn] of Object.entries(handlers)) assign(action, fn);
    return () => {
      for (const action of Object.keys(handlers)) assign(action, null);
      session.metadata = null;
    };
  }, [session, controller]);
  const sessionTitle = clip?.headline;
  const sessionArtist = clip?.newsletter;
  const sessionAlbum = selectedEntry?.short;
  React.useEffect(() => {
    if (!session || !sessionTitle || !globalThis.MediaMetadata) return;
    session.metadata = new globalThis.MediaMetadata({ title: sessionTitle, artist: sessionArtist, album: `news.fm · ${sessionAlbum}` });
  }, [session, sessionTitle, sessionArtist, sessionAlbum]);
  React.useEffect(() => {
    if (session) session.playbackState = speaking ? 'playing' : snap.status === 'paused' ? 'paused' : 'none';
  }, [session, speaking, snap.status]);

  React.useEffect(() => {
    libRef.current = lib;
    progressRef.current = progress;
  });

  React.useEffect(() => {
    controller.setHandlers({
      onClipEnd: (ended, index, queueId) => {
        const next = markHeard(progressRef.current, queueId, ended.id);
        progressRef.current = next;
        setProgress(next);
        writeProgress(storage, next);
      },
      onMessage: (text) => flash(text, 'warn'),
    });
  }, [controller, storage, flash]);

  React.useEffect(() => controller.setVoice(voice), [controller, voice]);

  // Stop on leaving the page or locking. Tab switches are left alone: on a
  // desktop it should keep reading, and a phone stops on its own (recheck below).
  // Laptop audio plays on with the screen off, and recheck leaves it alone.
  React.useEffect(() => {
    const hide = () => controller.pause();
    const back = () => {
      if (!document.hidden) controller.recheck();
    };
    window.addEventListener('pagehide', hide);
    document.addEventListener('visibilitychange', back);
    return () => {
      window.removeEventListener('pagehide', hide);
      document.removeEventListener('visibilitychange', back);
      controller.pause();
    };
  }, [controller]);

  React.useEffect(() => {
    setMode(speaking ? 'PLAYING' : snap.status === 'paused' ? 'PAUSED' : null);
  }, [speaking, snap.status, setMode]);
  React.useEffect(() => () => setMode(null), [setMode]);

  // Deep links, once: a named wrap-up jumps the decrypt queue, and a name that
  // does not exist is reported. The first render may have used the clip already.
  const linkHandled = React.useRef(false);
  React.useEffect(() => {
    if (linkHandled.current) return;
    linkHandled.current = true;
    if (url.week) {
      if (!entries.some((e) => e.id === url.week)) flash(`no wrap-up ${url.week}`, 'warn');
      else if (!libRef.current[url.week]) prioritize(url.week);
    }
    if (wantedClip.current && controller.queueId) {
      if (!controller.clips.some((c) => c.id === wantedClip.current)) flash(`no clip ${wantedClip.current} in this wrap-up`, 'warn');
      wantedClip.current = null;
    }
  }, [url, entries, controller, prioritize, flash]);

  const attach = React.useCallback(
    (id, stories) => {
      const wanted = wantedClip.current ? stories.findIndex((s) => s.id === wantedClip.current) : -1;
      if (wantedClip.current && wanted < 0) flash(`no clip ${wantedClip.current} in this wrap-up`, 'warn');
      wantedClip.current = null;
      controller.setQueue(stories, wanted >= 0 ? wanted : resumeIndex(stories, progressRef.current, id), id);
      if (playOnAttach.current) controller.play();
      playOnAttach.current = false;
    },
    [controller, flash],
  );

  React.useEffect(() => {
    if (selected && wrapUp?.status === 'ready' && snap.queueId !== selected) attach(selected, wrapUp.stories);
  }, [selected, wrapUp, snap.queueId, attach]);

  // ?w= and #clip- follow the player; last position follows too.
  React.useEffect(() => {
    if (!attached) return;
    const next = newsUrl(window.location.href, selected, clip?.id ?? null);
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(window.history.state, '', next);
    const updated = setLastClip(progressRef.current, selected, snap.clip);
    if (updated !== progressRef.current) {
      progressRef.current = updated;
      setProgress(updated);
      writeProgress(storage, updated);
    }
  }, [attached, selected, clip, snap.clip, storage]);

  const selectWrapUp = React.useCallback(
    (id, { play = false } = {}) => {
      setSelected(id);
      if (id === controller.queueId) {
        if (play) controller.play();
        return;
      }
      const target = libRef.current[id];
      if (target?.status === 'ready') {
        // Synchronous, so a play here is still inside the user's gesture.
        playOnAttach.current = play;
        attach(id, target.stories);
      } else {
        controller.setQueue([], 0, null);
        prioritize(id);
      }
    },
    [controller, attach, prioritize],
  );

  React.useEffect(() => {
    const onHash = () => {
      const { clipId } = readNewsUrl(window.location.href);
      if (!clipId) return;
      const found = findClip(entries, libRef.current, clipId);
      if (!found) {
        flash(`no clip ${clipId}`, 'warn');
      } else if (found.id === controller.queueId) {
        controller.goTo(found.index);
      } else {
        wantedClip.current = clipId;
        selectWrapUp(found.id);
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [entries, controller, flash, selectWrapUp]);

  function saveSettings(next) {
    setSettings(next);
    writeSettings(storage, next);
  }
  function changeRate(rate) {
    const next = clampRate(rate);
    controller.setRate(next);
    saveSettings({ ...settings, rate: next });
    flash(`speed ${rateLabel(next)}`, 'info');
  }
  function changeAutoplay(on) {
    controller.setAutoplay(on);
    saveSettings({ ...settings, autoplay: on });
  }

  function toggle() {
    if (!canPlay) flash(SPEECH_REASON[speech.phase], 'warn');
    else controller.toggle();
  }

  const actions = React.useRef({});
  React.useEffect(() => {
    actions.current = {
      toggle,
      next: () => controller.next(),
      prev: () => controller.prev(),
      faster: () => changeRate(stepRate(settings.rate, 1)),
      slower: () => changeRate(stepRate(settings.rate, -1)),
      cycle: () => changeRate(cycleRate(settings.rate)),
    };
  });

  const scrollerRef = React.useRef(null);

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target) || e.target?.closest?.('[data-cmdline]')) return;
      const a = actions.current;
      if (e.key === ' ') {
        // Space on a focused control activates that control.
        if (e.repeat || e.target?.closest?.('button, a, summary, label, input')) return;
        e.preventDefault();
        a.toggle();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        // A focused clip with more text than fits scrolls instead.
        const el = scrollerRef.current;
        if (el && e.target === el && el.scrollHeight > el.clientHeight) return;
        e.preventDefault();
        if (e.key === 'ArrowDown') a.next();
        else a.prev();
      } else if (e.key === 'j' || e.key === 'ArrowRight') {
        e.preventDefault();
        a.next();
      } else if (e.key === 'k' || e.key === 'ArrowLeft') {
        e.preventDefault();
        a.prev();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        a.faster();
      } else if (e.key === '-') {
        e.preventDefault();
        a.slower();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const commands = React.useMemo(
    () => [
      { name: 'play', desc: 'play or pause speech', keys: ['space'], run: () => actions.current.toggle() },
      { name: 'next', desc: 'next clip', keys: ['j'], run: () => actions.current.next() },
      { name: 'prev', desc: 'previous clip', keys: ['k'], run: () => actions.current.prev() },
      { name: 'speed', desc: `cycle speed, now ${rateLabel(settings.rate)}`, keys: ['+', '-'], run: () => actions.current.cycle() },
      { name: 'lock', desc: 'forget the passphrase on this device', run: () => onLock() },
    ],
    [settings.rate, onLock],
  );
  useCommands(commands);

  // The active sentence stays in view inside the clip. Not scrollIntoView: that would move the page too.
  const activeRef = React.useRef(null);
  React.useEffect(() => {
    const el = activeRef.current;
    const box = scrollerRef.current;
    if (!el || !box || box.scrollHeight <= box.clientHeight) return;
    const a = el.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    if (a.top < b.top) box.scrollTop -= b.top - a.top + 8;
    else if (a.bottom > b.bottom) box.scrollTop += a.bottom - b.bottom + 8;
  }, [snap.sentence, clip]);
  const clipId = clip?.id;
  React.useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
  }, [clipId]);

  // Vertical drags on the clip: touch-action hands them to us, so scrolling a long script is done here too.
  const drag = React.useRef(null);
  const swipe = {
    onPointerDown: (e) => {
      if (e.pointerType === 'mouse' || !e.isPrimary) return;
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, top: e.currentTarget.scrollTop };
    },
    onPointerMove: (e) => {
      const d = drag.current;
      if (d?.id === e.pointerId) e.currentTarget.scrollTop = d.top - (e.clientY - d.y);
    },
    onPointerUp: (e) => {
      const d = drag.current;
      if (d?.id !== e.pointerId) return;
      drag.current = null;
      const el = e.currentTarget;
      const action = swipeAction({
        dx: e.clientX - d.x,
        dy: e.clientY - d.y,
        startTop: d.top,
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
        selecting: !(window.getSelection()?.isCollapsed ?? true),
      });
      if (action === 'next') controller.next();
      else if (action === 'prev') controller.prev();
    },
    onPointerCancel: () => {
      drag.current = null;
    },
  };

  const finished = snap.status === 'finished';
  const nextWrapUp = finished ? nextUnheardWrapUp(entries, lib, progress, selected) : null;
  // Below 0: laptop audio before its first cue, or with cues that match no sentence.
  const highlight = (speaking || snap.status === 'paused') && snap.sentence >= 0;
  const playLabel = speaking ? 'pause' : snap.status === 'paused' ? 'resume' : finished || snap.status === 'ended' ? 'play again' : 'play';

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-x-10 xl:grid-cols-[minmax(0,1fr)_23rem]">
      <section
        id="clip"
        aria-label="clip"
        className="flex h-[calc(100dvh-76px)] min-w-0 flex-col py-3 lg:h-auto lg:min-h-[32rem] lg:rounded lg:border lg:border-line lg:bg-surface lg:p-6"
      >
        {clip ? (
          <>
            <div className="flex items-baseline justify-between gap-x-4">
              <span className="label min-w-0 truncate">{clip.newsletter || 'newsletter'}</span>
              <span className="shrink-0 whitespace-nowrap font-mono text-[12px] text-fg-dim">
                clip {snap.clip + 1} / {clips.length}
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-4">
              <time dateTime={clip.receivedAt} className="font-mono text-[12px] text-fg-faint">
                {formatReceived(clip.receivedAt)}
              </time>
              <span className="font-mono text-[12px] text-fg-faint">
                {selectedEntry?.short}
                {audio && ` · voice · ${clipHasAudio ? voiceLabel(audio.voice) : 'device'}`}
              </span>
            </div>
            <div
              ref={scrollerRef}
              tabIndex={0}
              {...swipe}
              className="mt-4 min-h-0 flex-1 touch-pan-x touch-pinch-zoom overflow-y-auto lg:flex-none lg:touch-auto lg:overflow-visible"
            >
              <div key={clip.id} className="anim-clip">
                <h2 className="font-sans text-[clamp(1.625rem,5vw,2.5rem)] font-semibold leading-[1.15] tracking-[-0.02em] text-fg">{clip.headline}</h2>
                <p className="mt-4 max-w-[66ch] leading-[1.65]">
                  {clip.sentences.map((s, i) => {
                    const active = highlight && i === snap.sentence;
                    return (
                      <span key={i} ref={active ? activeRef : undefined} aria-current={active ? 'true' : undefined} className={`transition-colors duration-150 ease-out ${!highlight || active ? 'text-fg' : 'text-fg-dim'}`}>
                        {s}{' '}
                      </span>
                    );
                  })}
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1">
            {wrapUp?.status === 'ready' && attached && !clips.length && <p className="font-mono text-[13px] text-fg-dim">{selectedEntry?.label} has no clips: no email arrived that week.</p>}
            {wrapUp?.status === 'error' && (
              <div role="alert" className="font-mono text-[13px]">
                <p className="break-words text-warn">
                  <span aria-hidden="true">✗ </span>
                  {wrapUp.error}
                </p>
                <button type="button" onClick={() => selectWrapUp(selected)} className="btn mt-3">
                  retry
                </button>
              </div>
            )}
            {(!wrapUp || wrapUp.status === 'loading') && (
              <p role="status" className="font-mono text-[13px] text-fg-faint">
                {selected ? `deriving key for ${selectedEntry?.short ?? selected}…` : 'finding the newest wrap-up with unheard clips…'}
              </p>
            )}
          </div>
        )}

        {finished && (
          <div role="status" className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3 font-mono text-[13px]">
            <span className="text-ok">
              <span aria-hidden="true">✓ </span>wrap-up finished
            </span>
            {nextWrapUp ? (
              <button type="button" onClick={() => selectWrapUp(nextWrapUp.id, { play: true })} className="btn btn-primary max-w-full">
                next unheard: {nextWrapUp.short}
              </button>
            ) : (
              <span className="text-fg-dim">nothing else unheard</span>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center justify-center gap-3 lg:justify-start">
          <button type="button" className="btn h-12 w-12 shrink-0 justify-center px-0 text-[16px]" onClick={() => controller.prev()} disabled={!clip || snap.clip === 0} aria-label="previous clip" aria-keyshortcuts="k">
            <span aria-hidden="true">←</span>
          </button>
          <button
            type="button"
            className={`btn ${nextWrapUp ? '' : 'btn-primary'} h-14 min-w-[10.5rem] justify-center text-[15px]`}
            onClick={toggle}
            disabled={!clip || !canPlay}
            aria-keyshortcuts="Space"
            aria-describedby={canPlay ? undefined : 'news-speech-reason'}
          >
            <span aria-hidden="true">{speaking ? '❚❚' : '▶'}</span>
            {playLabel}
          </button>
          <button type="button" className="btn h-12 w-12 shrink-0 justify-center px-0 text-[16px]" onClick={() => controller.next()} disabled={!clip || snap.clip >= clips.length - 1} aria-label="next clip" aria-keyshortcuts="j">
            <span aria-hidden="true">→</span>
          </button>
        </div>

        {!canPlay && (
          <p id="news-speech-reason" className="mt-2 text-center font-mono text-[12px] text-fg-dim lg:text-left">
            {SPEECH_REASON[speech.phase]}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 font-mono text-[12px] text-fg-faint">
          <span>
            {rateLabel(settings.rate)}
            {highlight && clip && (
              <>
                {' '}
                · sentence {snap.sentence + 1}/{clip.sentences.length}
              </>
            )}
          </span>
          <span className="hidden gap-x-3 lg:flex" aria-hidden="true">
            <span>
              <kbd className="kbd">space</kbd> play
            </span>
            <span>
              <kbd className="kbd">j</kbd> <kbd className="kbd">k</kbd> clip
            </span>
            <span>
              <kbd className="kbd">+</kbd> <kbd className="kbd">-</kbd> speed
            </span>
          </span>
          <span aria-hidden="true" className="lg:hidden">
            swipe ↑ next · ↓ prev
          </span>
          <button type="button" onClick={() => scrollToId('wrapups')} className="link text-fg-dim lg:hidden">
            wrap-ups ↓
          </button>
        </div>
      </section>

      <aside className="min-w-0 pt-8 lg:pt-0">
        <section id="wrapups" tabIndex={-1} aria-labelledby="h-wrapups" className="scroll-mt-16 focus:outline-none">
          <div className="mb-2 flex items-center justify-between gap-x-4 border-t border-line pt-4 lg:border-t-0 lg:pt-0">
            <h2 id="h-wrapups" className="font-mono text-[15px] font-medium text-fg">
              <span className="text-fg-faint" aria-hidden="true">
                ##{' '}
              </span>
              wrap-ups
            </h2>
            <button type="button" onClick={onLock} className="btn h-7 px-2 text-[12px]">
              lock
            </button>
          </div>
          <ul className="space-y-0.5">
            {entries.map((entry) => (
              <WrapUpRow key={entry.id} entry={entry} wrapUp={lib[entry.id]} progress={progress} current={entry.id === selected} onSelect={selectWrapUp} />
            ))}
          </ul>
        </section>
        <Settings
          voices={speech.voices}
          voice={voice}
          settings={settings}
          onVoice={(name) => saveSettings({ ...settings, voice: name })}
          onRate={changeRate}
          onAutoplay={changeAutoplay}
          laptopVoice={laptop.media && audio?.done ? audio.voice : null}
        />
      </aside>
    </div>
  );
}
