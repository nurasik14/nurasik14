import React from 'react';
import { WrongPassphraseError } from '../../plugins/news-core.js';
import { isLoopbackHost } from '../planner/store.js';
import AppShell, { useShell } from '../shell/AppShell';
import Player from './Player.jsx';
import { audioStatus, connectMessage, forgetPassphrase, loadIndex, newsStatus, openWrapUp, readRemembered, rememberPassphrase, safeStorage } from './store.js';
import SyncPanel from './SyncPanel.jsx';
import Unlock from './Unlock.jsx';

const AUDIO_POLL_MS = 3000;

/** The laptop audio list, on localhost only. Polled while a job runs, so clips switch to Ava as they appear. */
function useAudioList(local) {
  const [audio, setAudio] = React.useState(null);
  const reload = React.useCallback(() => {
    audioStatus().then(setAudio, (err) => {
      // A static server has no API; a blip keeps the last list.
      if (/^HTTP 404$/.test(err.message)) setAudio(null);
    });
  }, []);
  React.useEffect(() => {
    if (local) reload();
  }, [local, reload]);
  const running = local && Boolean(audio?.running);
  React.useEffect(() => {
    if (!running) return undefined;
    const poll = setInterval(reload, AUDIO_POLL_MS);
    return () => clearInterval(poll);
  }, [running, reload]);
  return { audio: local ? audio : null, reload };
}

/** ?google=connected|error&reason=… from the OAuth callback; removed once read. */
function takeGoogleParam() {
  const url = new URL(window.location.href);
  const result = url.searchParams.get('google');
  if (!result) return null;
  const reason = url.searchParams.get('reason');
  url.searchParams.delete('google');
  url.searchParams.delete('reason');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  return { result, reason };
}

function ModeBadge({ local }) {
  const [text, cls] = local ? ['local · sync', 'border-ok/60 text-ok'] : ['pages · encrypted', 'border-info/60 text-info'];
  return <span className={`inline-flex h-6 items-center rounded border px-2 font-mono text-[12px] ${cls}`}>{text}</span>;
}

function NewsPage({ local }) {
  const { setMode, flash } = useShell();
  const [storage] = React.useState(safeStorage);
  const [phase, setPhase] = React.useState('loading'); // loading | error | empty | unlocking | locked | unlocked
  const [error, setError] = React.useState('');
  const [entries, setEntries] = React.useState([]);
  const [session, setSession] = React.useState(null); // { passphrase, first }: memory only
  const [form, setForm] = React.useState({ busy: false, error: null, note: '' });
  const sessionRef = React.useRef(null);
  const { audio, reload: reloadAudio } = useAudioList(local);

  const enter = React.useCallback((next) => {
    sessionRef.current = next;
    setSession(next);
    setPhase(next ? 'unlocked' : 'locked');
  }, []);

  const apply = React.useCallback(
    async (next, isLive) => {
      if (!isLive()) return;
      setEntries(next);
      if (sessionRef.current) return; // a sync re-read: the player picks new entries up
      if (!next.length) {
        setPhase('empty');
        return;
      }
      const stored = readRemembered(storage);
      if (!stored) {
        setPhase('locked');
        return;
      }
      setPhase('unlocking');
      try {
        const first = await openWrapUp(next[0].id, stored);
        if (isLive()) enter({ passphrase: stored, first });
      } catch (err) {
        if (!(err instanceof WrongPassphraseError)) throw err;
        forgetPassphrase(storage);
        if (!isLive()) return;
        setForm({ busy: false, error: null, note: 'The remembered passphrase no longer works, so it was removed from this device.' });
        setPhase('locked');
      }
    },
    [storage, enter],
  );

  const [attempt, setAttempt] = React.useState(0);
  React.useEffect(() => {
    let live = true;
    loadIndex()
      .then((next) => apply(next, () => live))
      .catch((err) => {
        if (!live) return;
        setError(err.message);
        setPhase('error');
      });
    return () => {
      live = false;
    };
  }, [apply, attempt]);

  const retry = () => {
    setPhase('loading');
    setError('');
    setAttempt((n) => n + 1);
  };

  // After a sync: re-read in place, and on failure keep whatever is on screen.
  const refresh = React.useCallback(() => {
    loadIndex()
      .then((next) => apply(next, () => true))
      .catch((err) => flash(`could not re-read the index: ${err.message}`, 'warn'));
    // A sync that published something has just started an audio job.
    reloadAudio();
  }, [apply, flash, reloadAudio]);

  async function unlock(value, remember) {
    setForm({ busy: true, error: null, note: '' });
    try {
      const first = await openWrapUp(entries[0].id, value);
      if (remember) rememberPassphrase(storage, value);
      else forgetPassphrase(storage);
      setForm({ busy: false, error: null, note: '' });
      enter({ passphrase: value, first });
    } catch (err) {
      setForm({ busy: false, error: { text: err.message }, note: '' });
    }
  }

  const lock = React.useCallback(() => {
    forgetPassphrase(storage);
    setForm({ busy: false, error: null, note: '' });
    enter(null);
    flash('locked · passphrase forgotten on this device', 'info');
  }, [storage, enter, flash]);

  React.useEffect(() => {
    if (phase === 'locked' || phase === 'unlocking') setMode('LOCKED');
    else if (phase !== 'unlocked') setMode(null);
  }, [phase, setMode]);

  React.useEffect(() => {
    const param = takeGoogleParam();
    if (!param) return;
    const [text, tone] = connectMessage(param.result, param.reason);
    flash(text, tone);
  }, [flash]);

  const unlocked = phase === 'unlocked';

  return (
    // The clip fills a phone screen below the top bar, so the header is for screen readers there.
    <div className={`wrap pb-16 ${unlocked ? 'lg:pt-12' : 'pt-8 sm:pt-12'}`}>
      <header className={unlocked ? 'sr-only lg:not-sr-only lg:mb-6' : 'mb-8'}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="font-mono text-[26px] font-medium tracking-[-0.01em] text-fg sm:text-[30px]">
            <span className="text-fg-faint" aria-hidden="true">
              ##{' '}
            </span>
            news.fm
          </h1>
          <ModeBadge local={local} />
        </div>
        <p className="mt-2 max-w-[64ch] text-fg-dim">
          My newsletters, rewritten as short spoken clips and read aloud by this browser. The published files are encrypted, so playing them takes the passphrase.
        </p>
      </header>

      {phase === 'loading' && (
        <p role="status" className="font-mono text-[13px] text-fg-faint">
          reading data/news/index.json…
        </p>
      )}

      {phase === 'error' && (
        <div role="alert" className="max-w-[52rem] font-mono text-[13px]">
          <p className="break-words text-warn">
            <span aria-hidden="true">✗ </span>
            {error}
          </p>
          <button type="button" onClick={retry} className="btn mt-3">
            retry
          </button>
        </div>
      )}

      {phase === 'empty' && (
        <p className="max-w-[64ch] font-mono text-[13px] text-fg-dim">
          Nothing is published yet. Wrap-ups appear here after the first sync is committed and pushed.
          {local && ' Use the panel below to connect the news account and run it.'}
        </p>
      )}

      {phase === 'unlocking' && (
        <p role="status" className="font-mono text-[13px] text-fg-faint">
          deriving key from the remembered passphrase…
        </p>
      )}

      {phase === 'locked' && <Unlock busy={form.busy} error={form.error} note={form.note} onSubmit={unlock} />}

      {unlocked && session && <Player entries={entries} first={session.first} passphrase={session.passphrase} onLock={lock} local={local} audio={audio} />}

      {local && phase !== 'loading' && <SyncPanel onSynced={refresh} audio={audio} onAudioChanged={reloadAudio} />}
    </div>
  );
}

export default function NewsApp() {
  const [local, setLocal] = React.useState(() => isLoopbackHost(window.location.hostname));
  // A plain static server on localhost (e.g. serving dist/) has no API: behave like Pages,
  // as the planner does, instead of showing a sync panel that can only fail.
  React.useEffect(() => {
    if (!isLoopbackHost(window.location.hostname)) return;
    newsStatus().catch((err) => {
      if (/^HTTP 404$/.test(err.message)) setLocal(false);
    });
  }, []);
  return (
    <AppShell page="news" defaultMode={local ? 'NORMAL' : 'READONLY'}>
      <NewsPage local={local} />
    </AppShell>
  );
}
