import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import plannerApi from './plugins/planner-api.js';

// Locally the site is served from "/" (http://localhost:5173/).
// On GitHub Pages the workflow sets VITE_BASE_PATH to "/<repo>/".
const BASE_PATH = process.env.VITE_BASE_PATH ?? '/';

export default defineConfig({
  base: BASE_PATH,
  // plannerApi adds a small JSON read/write API to `vite` (dev) and
  // `vite preview`. It does not exist in the static Pages build, which is
  // how the planner knows it is read-only there.
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
});
