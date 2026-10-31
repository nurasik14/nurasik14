// Shell context. Import useShell from './AppShell' (the public entry point).
import { createContext, useContext, useEffect } from 'react';

export const ShellContext = createContext({ mode: 'NORMAL', setMode: () => {}, flash: () => {}, registerCommands: () => () => {} });
export const useShell = () => useContext(ShellContext);

/**
 * Add page commands to the command line while the caller is mounted:
 * [{ name, desc, keys?, run }]. Pass a memoized array; [] registers nothing.
 */
export function useCommands(commands) {
  const { registerCommands } = useShell();
  useEffect(() => (commands.length ? registerCommands(commands) : undefined), [registerCommands, commands]);
}
