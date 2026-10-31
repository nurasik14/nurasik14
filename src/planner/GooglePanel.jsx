import React from 'react';
import { useCommands, useShell } from '../shell/AppShell';
import { CONNECT_HREF, disconnectGoogle, googleStatus, selectCalendars, SETUP_DOC, SLOT_BORDER, syncGoogle, syncSummary } from './google.js';

function formatStamp(iso) {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

/**
 * Local mode only. Nothing here talks to Google until the owner presses
 * `sync`, `connect` or changes "pull from"; the status call reads the
 * calendar list live, on page load only.
 */
export default function GooglePanel({ onSynced }) {
  const { flash } = useShell();
  const [state, setState] = React.useState({ phase: 'loading', data: null, error: '' });
  const [syncing, setSyncing] = React.useState(false);
  const [errors, setErrors] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const syncingRef = React.useRef(false);

  const load = React.useCallback(() => {
    googleStatus().then(
      (data) => setState({ phase: 'ready', data, error: '' }),
      (err) => setState({ phase: 'error', data: null, error: err.message }),
    );
  }, []);
  React.useEffect(load, [load]);

  const s = state.data;
  const connected = state.phase === 'ready' && s.connected;

  const runSync = React.useCallback(async () => {
    if (syncingRef.current) {
      flash('sync already running', 'info');
      return;
    }
    syncingRef.current = true;
    setSyncing(true);
    setErrors([]);
    try {
      const r = await syncGoogle();
      setErrors(r.errors);
      if (r.pushed.foreign) setErrors((e) => [...e, `planner.cal has ${r.pushed.foreign} event(s) not made by sync · left alone`]);
      setState((st) => ({ ...st, data: { ...st.data, lastSync: r.lastSync } }));
      flash(`${syncSummary(r)}${r.errors.length ? ` · ${r.errors.length} error${r.errors.length === 1 ? '' : 's'}` : ''}`, r.errors.length ? 'warn' : 'ok');
      onSynced();
      // planner.cal may have just been created.
      load();
    } catch (err) {
      if (err.message === 'reconnect') {
        flash('google: access expired or revoked · reconnect', 'warn');
        load();
      } else {
        setErrors([err.message]);
        flash(`sync failed: ${err.message}`, 'warn');
      }
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [flash, onSynced, load]);

  const runRef = React.useRef(runSync);
  React.useEffect(() => {
    runRef.current = runSync;
  });
  const commands = React.useMemo(
    () => (connected ? [{ name: 'sync', desc: 'pull Google events, push sealed plans to planner.cal', run: () => runRef.current() }] : []),
    [connected],
  );
  useCommands(commands);

  async function disconnect() {
    setBusy(true);
    try {
      await disconnectGoogle();
      setErrors([]);
      flash('google disconnected · token revoked and deleted', 'info');
      load();
    } catch (err) {
      flash(`disconnect failed: ${err.message}`, 'warn');
    } finally {
      setBusy(false);
    }
  }

  async function toggleCalendar(id, on) {
    const before = s.calendars;
    const next = before.map((c) => (c.id === id ? { ...c, selected: on } : c));
    setState((st) => ({ ...st, data: { ...st.data, calendars: next } }));
    try {
      await selectCalendars(next.filter((c) => c.selected).map((c) => c.id));
      load();
    } catch (err) {
      setState((st) => ({ ...st, data: { ...st.data, calendars: before } }));
      flash(`not saved: ${err.message}`, 'warn');
    }
  }

  let row;
  if (state.phase === 'loading') {
    row = <span className="text-fg-faint">checking…</span>;
  } else if (state.phase === 'error') {
    row = (
      <>
        <span className="text-warn">
          <span aria-hidden="true">✗ </span>status unavailable: {state.error}
        </span>
        <button type="button" className="btn h-7 px-2 text-[12px]" onClick={load}>
          retry
        </button>
      </>
    );
  } else if (!s.configured) {
    row = (
      <span className="min-w-0 text-fg-dim">
        not configured · save a Desktop OAuth client as <code className="break-all text-fg">{s.clientFile}</code> · setup:{' '}
        <span className="text-info">{SETUP_DOC}</span>
        {s.configError && (
          <span className="mt-1 block text-warn">
            <span aria-hidden="true">✗ </span>
            {s.configError}
          </span>
        )}
      </span>
    );
  } else if (!s.connected) {
    row = (
      <>
        <span className={s.reconnect ? 'text-warn' : 'text-fg-dim'}>
          {s.reconnect ? (
            <>
              <span aria-hidden="true">✗ </span>access expired or revoked
            </>
          ) : (
            'not connected'
          )}
        </span>
        <a className="btn h-7 px-2 text-[12px]" href={CONNECT_HREF}>
          {s.reconnect ? 'reconnect google' : 'connect google'}
        </a>
      </>
    );
  } else {
    row = (
      <>
        <span className="text-ok">
          <span aria-hidden="true">● </span>connected
        </span>
        {s.email && <span className="min-w-0 break-all text-fg-dim">{s.email}</span>}
        <span className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:ml-auto">
          <button type="button" className="btn btn-primary h-7 px-2.5 text-[12px]" onClick={runSync} disabled={syncing} aria-describedby="google-last-sync">
            {syncing ? 'syncing…' : 'sync'}
          </button>
          <span id="google-last-sync" className="text-fg-faint">
            {s.lastSync ? (
              <>
                last sync <time dateTime={s.lastSync}>{formatStamp(s.lastSync)}</time>
              </>
            ) : (
              'never synced'
            )}
          </span>
          <button type="button" className="btn h-7 px-2 text-[12px]" onClick={disconnect} disabled={busy || syncing}>
            disconnect
          </button>
        </span>
      </>
    );
  }

  const selectedCount = connected ? s.calendars.filter((c) => c.selected).length : 0;

  return (
    <section aria-labelledby="google-label" className="mt-3 max-w-[52rem] rounded border border-line bg-surface font-mono text-[12.5px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
        <span id="google-label" className="label">
          google
        </span>
        {row}
      </div>

      {connected && s.error && (
        <p className="border-t border-line-soft px-3 py-2 text-warn">
          <span aria-hidden="true">✗ </span>calendar list: {s.error}
        </p>
      )}

      {connected && (
        <details className="group border-t border-line-soft">
          <summary className="cursor-pointer list-none px-3 py-2 text-fg-dim hover:text-fg [&::-webkit-details-marker]:hidden">
            <span aria-hidden="true" className="inline-block w-3 text-fg-faint transition-transform duration-150 ease-out group-open:rotate-90 motion-reduce:transition-none">
              ›
            </span>
            pull from <span className="text-fg-faint">({selectedCount} of {s.calendars.length})</span>
          </summary>
          <fieldset className="px-3 pb-3">
            <legend className="sr-only">calendars to pull from</legend>
            <ul className="space-y-0.5">
              {s.calendars.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-start gap-2.5 rounded px-1.5 py-1 hover:bg-surface-2">
                    <input
                      type="checkbox"
                      checked={c.selected}
                      onChange={(e) => toggleCalendar(c.id, e.target.checked)}
                      className="mt-[3px] h-4 w-4 shrink-0 accent-info"
                    />
                    <span className="min-w-0 break-words text-fg">
                      {c.selected && <span aria-hidden="true" className={`mr-1.5 inline-block h-3 border-l border-dashed ${SLOT_BORDER[c.color ?? 0]}`} />}
                      {c.name}
                      {c.primary && <span className="text-fg-faint"> · primary</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12px] text-fg-faint">
              titles and times of these calendars are published on sync (private events as "busy"). Plans are pushed to{' '}
              <span className="text-fg-dim">planner.cal</span>
              {s.plannerCalendar ? '' : ', created on the first sync'}.
            </p>
          </fieldset>
        </details>
      )}

      {errors.length > 0 && (
        <ul role="alert" className="space-y-0.5 border-t border-line-soft px-3 py-2 text-[12px] text-warn">
          {errors.map((e, i) => (
            <li key={i} className="break-words">
              <span aria-hidden="true">✗ </span>
              {e}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
