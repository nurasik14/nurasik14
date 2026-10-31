// STUB — replaced by the real shell (see docs/DESIGN.md "Shell").
// The exported API below is the contract; keep it stable.
import React from 'react';

const ShellContext = React.createContext({ mode: 'NORMAL', setMode: () => {}, flash: () => {} });
export const useShell = () => React.useContext(ShellContext);

export default function AppShell({ page = 'index', sections = [], defaultMode = 'NORMAL', children }) {
  const [mode, setModeState] = React.useState(defaultMode);
  const [msg, setMsg] = React.useState('');
  const setMode = React.useCallback((m) => setModeState(m ?? defaultMode), [defaultMode]);
  const flash = React.useCallback((text) => setMsg(text), []);
  return (
    <ShellContext.Provider value={{ mode, setMode, flash }}>
      <main data-page={page} data-sections={sections.length} className="pb-10">{children}</main>
      <div className="fixed inset-x-0 bottom-0 h-7 bg-surface font-mono text-xs" role="status">
        {mode} {page} {msg}
      </div>
    </ShellContext.Provider>
  );
}
