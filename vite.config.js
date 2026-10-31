import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import plannerApi from './plugins/planner-api.js';

// Locally the site is served from "/" (http://localhost:5173/).
// On GitHub Pages the workflow sets VITE_BASE_PATH to "/<repo>/".
const BASE_PATH = process.env.VITE_BASE_PATH ?? '/';

// Real build info for the footer: short commit sha + build date.
const gitSha = () => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return process.env.GITHUB_SHA?.slice(0, 7) ?? 'dev';
  }
};

export default defineConfig(({ command }) => ({
  base: BASE_PATH,
  define: {
    'import.meta.env.VITE_COMMIT': JSON.stringify(command === 'build' ? gitSha() : 'dev'),
    'import.meta.env.VITE_BUILT_AT': JSON.stringify(command === 'build' ? new Date().toISOString().slice(0, 10) : 'dev'),
  },
  // plannerApi adds a small JSON read/write API to `vite` (dev) and
  // `vite preview`. It does not exist in the static Pages build; the planner
  // only probes it on loopback hosts and is read-only everywhere else.
  plugins: [react(), plannerApi()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        planner: resolve(import.meta.dirname, 'planner/index.html'),
      },
    },
  },
}));
