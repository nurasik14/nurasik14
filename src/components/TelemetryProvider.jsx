import React from 'react';
import { loadTelemetry, POLL_MS } from '../lib/telemetry';
import { MODE } from '../config/live.config';

/* ================================================================ *
 *  TelemetryProvider
 *
 *  Loads your scraper's telemetry.json once and shares it with every
 *  dashboard panel. While loading, children render the simulator so
 *  there is no empty flash. If the file is missing or malformed we
 *  stay on the simulator and expose the reason — the site degrades,
 *  it never breaks.
 *
 *  Children read it with useTelemetry():
 *    const { jobs, series, logs, sourceMix, source, reason } = useTelemetry();
 * ================================================================ */

const Ctx = React.createContext(null);

export function useTelemetry() {
  const v = React.useContext(Ctx);
  if (!v) throw new Error('useTelemetry must be used inside <TelemetryProvider>');
  return v;
}

export default function TelemetryProvider({ children, fallback }) {
  const [state, setState] = React.useState(() => ({
    loading: true,
    source: 'sim',
    reason: 'loading…',
    data: null,
  }));

  React.useEffect(() => {
    const ctl = new AbortController();
    let timer = null;

    const read = async () => {
      const r = await loadTelemetry(ctl.signal);
      if (ctl.signal.aborted) return;
      setState({ loading: false, ...r });
      if (POLL_MS > 0) timer = setTimeout(read, POLL_MS);
    };
    read();

    return () => {
      ctl.abort();
      if (timer) clearTimeout(timer);
    };
  }, []);

  const value = React.useMemo(
    () => ({
      loading: state.loading,
      source: state.source,
      reason: state.reason,
      isLive: state.source === 'file',
      mode: MODE,
      /* every panel gets real data when we have it, otherwise the
         seeded simulator — the component code never branches on this */
      ...(state.data ?? fallback),
      /* untouched payload for the raw inspector */
      raw: state.data,
    }),
    [state, fallback],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}