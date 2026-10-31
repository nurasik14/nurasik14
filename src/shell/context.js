// Shell context. Import useShell from './AppShell' (the public entry point).
import { createContext, useContext } from 'react';

export const ShellContext = createContext({ mode: 'NORMAL', setMode: () => {}, flash: () => {} });
export const useShell = () => useContext(ShellContext);
