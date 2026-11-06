import React from 'react';
import { useCommands, useShell } from '../shell/AppShell';
import { copyText } from '../lib/nav';
import { audioSummary } from './audio.js';
import { backlogText, CONNECT_HREF, newsStatus, PUBLISH_CMD, rebuildNews, startAudio, syncNews, syncSummary } from './store.js';

const POLL_MS = 5000;

function formatStamp(iso) {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function Row({ name, children }) {
  return (
    <div className="grid grid-cols-[9ch_minmax(0,1fr)] gap-x-3">
      <dt className="text-fg-faint">{name}</dt>
      <dd className="min-w-0 break-words text-fg-dim">{children}</dd>
    </div>
  );
}

/** `audio 104/108 · Ava`, with what went wrong next to it. */
export function AudioRow({ audio }) {
  const problems = [
    audio.failed > 0 && `${audio.failed} failed`,
    audio.unreadable > 0 && `${audio.unreadable} ${audio.unreadable === 1 ? 'file' : 'files'} under another passphrase`,
    audio.error,
  ].filter(Boolean);
  return (
    <Row name="audio">
      {audioSummary(audio)}
      {problems.map((text) => (
        <span key={text} className="text-warn">
          {' · '}
          <span aria-hidden="true">✗ </span>
          {text}
        </span>
      ))}
    </Row>
  );
}

export function AudioButton({ audio, onMake }) {
  return (
    <button type="button" className="btn h-7 px-2.5 text-[12px]" onClick={onMake} disabled={audio.running}>
      {audio.running ? `making audio ${audio.done}/${audio.total}` : 'make audio'}
    </button>
  );
}

export function RebuildButton({ rebuild = null, busy = false, onRebuild }) {
  let text = 'rebuild backlog';
  if (rebuild?.running) text = `rebuilding ${rebuild.done}${rebuild.total === null ? '' : `/${rebuild.total}`}`;
  else if (rebuild) text = 'continue rebuild';
  return (
    <button type="button" className="btn h-7 px-2.5 text-[12px]" onClick={onRebuild} disabled={busy}>
      {text}
    </button>
  );
}

function PublishCommand() {
  const { flash } = useShell();
  const [copied, setCopied] = React.useState(false);
  const codeRef = React.useRef(null);

  React.useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await copyText(PUBLISH_CMD);
      setCopied(true);
      flash('copied publish command', 'ok');
    } catch {
      window.getSelection().selectAllChildren(codeRef.current);
      flash('clipboard blocked · command selected, press Ctrl C', 'warn');
    }
  }

  return (
    <div className="flex items-stretch overflow-hidden border-t border-line-soft">
      <code ref={codeRef} className="min-w-0 flex-1 whitespace-pre-wrap break-words px-3 py-2 font-mono text-[12.5px] leading-relaxed text-fg-dim">
        <span className="select-none text-fg-faint" aria-hidden="true">
          ${' '}
        </span>
        {PUBLISH_CMD}
      </code>
      <button type="button" onClick={copy} className="shrink-0 border-l border-line px-3 font-mono text-[12px] text-fg-dim hover:bg-surface-2 hover:text-fg">
        {copied ? '✓ copied' : 'copy'}
      </button>
    </div>
  );
}

/**
 * Localhost only: the page renders this on loopback hosts and nowhere else, so
 * Pages makes no /api request. Nothing talks to Google or Claude until the
 * owner presses connect or sync; the status call only reads local files.
 */
export default function SyncPanel({ onSynced, audio = null, onAudioChanged = () => {} }) {
  const { flash } = useShell();
  const [state, setState] = React.useState({ phase: 'loading', data: null, error: '' });
  const [run, setRun] = React.useState(null); // { startedAt, label } while this page's POST is out
  const [elapsed, setElapsed] = React.useState(0);
  const [result, setResult] = React.useState(null); // { summary, skipped, error }
  const runRef = React.useRef(false);

  const load = React.useCallback(() => {
    newsStatus().then(
      (data) => setState({ phase: 'ready', data, error: '' }),
      (err) => setState({ phase: 'error', data: null, error: err.message }),
    );
  }, []);
  React.useEffect(load, [load]);

  const s = state.data;
  const elsewhere = !run && Boolean(s?.syncing); // started before a reload, or with curl
  const busy = Boolean(run) || elsewhere;
  const rebuild = s?.backlog?.rebuild ?? null;

  // Long-running: the elapsed counter ticks and the status poll shows backlog progress.
  React.useEffect(() => {
    if (!busy) return undefined;
    const startedAt = run?.startedAt ?? Date.now();
    const tick = setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000);
    const poll = setInterval(load, POLL_MS);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [busy, run, load]);

  // A sync this page did not start finished: its files are on disk now.
  const wasElsewhere = React.useRef(false);
  React.useEffect(() => {
    if (wasElsewhere.current && !elsewhere) onSynced();
    wasElsewhere.current = elsewhere;
  }, [elsewhere, onSynced]);

  const runJob = React.useCallback(
    async (label, post, describe = syncSummary) => {
      if (runRef.current) {
        flash('sync already running', 'info');
        return;
      }
      runRef.current = true;
      setRun({ startedAt: Date.now(), label });
      setElapsed(0);
      setResult(null);
      try {
        const r = await post();
        const summary = describe(r);
        setResult({ summary, skipped: r.skipped ?? null, error: null });
        flash(r.skipped ? `${summary} · skipped, see panel` : summary, r.skipped ? 'warn' : 'ok');
        onSynced();
      } catch (err) {
        setResult({ summary: null, skipped: null, error: err.message });
        flash(`${label} failed: ${err.message}`, 'warn');
      } finally {
        runRef.current = false;
        // The last poll may still say syncing; this page knows better.
        setState((st) => (st.data ? { ...st, data: { ...st.data, syncing: false } } : st));
        setRun(null);
        load();
      }
    },
    [flash, load, onSynced],
  );
  const runSync = React.useCallback(() => runJob('sync', syncNews), [runJob]);
  // The player keeps the copy it already decrypted until the page loads again.
  const runRebuild = () => runJob('rebuild', rebuildNews, (r) => `${syncSummary(r)}${r.published.length ? ' · reload the page to play it' : ''}`);

  async function makeAudio() {
    try {
      const { todo } = await startAudio();
      flash(todo ? `making audio · ${todo} clips` : 'every clip already has audio', todo ? 'info' : 'ok');
    } catch (err) {
      flash(`audio failed: ${err.message}`, 'warn');
    }
    onAudioChanged();
  }

  const audioRunning = Boolean(audio?.running);
  const audioWasRunning = React.useRef(false);
  React.useEffect(() => {
    if (audioWasRunning.current && !audioRunning && audio) flash(`audio ${audioSummary(audio)}${audio.failed ? ` · ${audio.failed} failed` : ''}`, audio.failed ? 'warn' : 'ok');
    audioWasRunning.current = audioRunning;
  }, [audioRunning, audio, flash]);

  const latestSync = React.useRef(runSync);
  React.useEffect(() => {
    latestSync.current = runSync;
  });
  const connected = state.phase === 'ready' && s.connected;
  const canRebuild = connected && s.backlog?.state === 'published';
  const commands = React.useMemo(
    () => (connected ? [{ name: 'sync', desc: 'read the inbox and write new wrap-ups (localhost)', run: () => latestSync.current() }] : []),
    [connected],
  );
  useCommands(commands);

  let body;
  if (state.phase === 'loading') {
    body = <p className="px-3 py-2 text-fg-faint">checking…</p>;
  } else if (state.phase === 'error') {
    body = (
      <p className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 text-warn">
        <span>
          <span aria-hidden="true">✗ </span>status unavailable: {state.error}
        </span>
        <button type="button" className="btn h-7 px-2 text-[12px]" onClick={load}>
          retry
        </button>
      </p>
    );
  } else {
    body = (
      <>
        <dl className="space-y-0.5 px-3 pb-2">
          <Row name="account">
            {s.connected && !s.needsReconnect && (
              <span className="text-ok">
                <span aria-hidden="true">● </span>connected
              </span>
            )}
            {s.connected && s.needsReconnect && (
              <span className="text-warn">
                <span aria-hidden="true">✗ </span>access expired or revoked
              </span>
            )}
            {!s.connected && 'not connected'}
            {s.account && <span> · {s.account}</span>}
          </Row>
          <Row name="backlog">{backlogText(s.backlog)}</Row>
          <Row name="pending">{s.pending.length ? s.pending.join(', ') : 'none'}</Row>
          <Row name="last sync">{s.lastSync ? <time dateTime={s.lastSync}>{formatStamp(s.lastSync)}</time> : 'never'}</Row>
          {audio && <AudioRow audio={audio} />}
          {s.passphrase !== 'ok' && (
            <Row name="secret">
              <span className="text-warn">
                <span aria-hidden="true">✗ </span>passphrase file is {s.passphrase} · see docs/NEWS.md
              </span>
            </Row>
          )}
          {!s.expectedAccountSet && (
            <Row name="settings">
              <span className="text-warn">
                <span aria-hidden="true">✗ </span>settings.json has no account · see docs/NEWS.md
              </span>
            </Row>
          )}
          {s.error && (
            <Row name="error">
              <span className="text-warn">
                <span aria-hidden="true">✗ </span>
                {s.error}
              </span>
            </Row>
          )}
        </dl>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line-soft px-3 py-2">
          {(!s.connected || s.needsReconnect) && (
            <a className="btn h-7 px-2 text-[12px]" href={CONNECT_HREF}>
              {s.connected ? 'reconnect google' : 'connect google'}
            </a>
          )}
          {s.connected && (
            <button type="button" className="btn h-7 px-2.5 text-[12px]" onClick={runSync} disabled={busy}>
              {busy ? 'syncing…' : 'sync'}
            </button>
          )}
          {audio && <AudioButton audio={audio} onMake={makeAudio} />}
          {canRebuild && <RebuildButton rebuild={rebuild} busy={busy} onRebuild={runRebuild} />}
          {run && (
            <span role="status" className="text-info">
              {run.label === 'rebuild' ? 'rebuilding' : 'syncing'}… one Claude call per email · {elapsed} s
            </span>
          )}
          {elsewhere && (
            <span role="status" className="text-info">
              {rebuild?.running ? 'a backlog rebuild is running on the dev server' : 'a sync is running on the dev server'}
            </span>
          )}
        </div>
        {audio && <p className="border-t border-line-soft px-3 py-2 text-fg-faint">make audio sends the scripts to Microsoft&apos;s Edge read-aloud service. The audio stays on this laptop.</p>}
        {canRebuild && <p className="border-t border-line-soft px-3 py-2 text-fg-faint">rebuild backlog re-runs every backlog email through Claude (~10 s each) and remakes its audio.</p>}
      </>
    );
  }

  return (
    <section aria-labelledby="sync-label" className="mt-12 max-w-[52rem] rounded border border-line bg-surface font-mono text-[12.5px]">
      <h2 id="sync-label" className="label px-3 pb-1 pt-2">
        sync · localhost only
      </h2>
      {body}
      {result && (
        <div className="space-y-1 border-t border-line-soft px-3 py-2">
          {result.summary && <p className="text-ok">{result.summary}</p>}
          {result.skipped && (
            <p className="break-words text-warn">
              <span aria-hidden="true">✗ </span>skipped: {result.skipped}
            </p>
          )}
          {result.error && (
            <p role="alert" className="break-words text-warn">
              <span aria-hidden="true">✗ </span>
              {result.error}
            </p>
          )}
        </div>
      )}
      <PublishCommand />
    </section>
  );
}
