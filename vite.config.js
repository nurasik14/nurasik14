import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages project sites are served from a SUB-PATH, not the domain root:
//   https://<user>.github.io/<repo>/  ->  base must be '/<repo>/'
// If you fork or rename this repo, update BASE_PATH below, or override it at
// build time:  VITE_BASE_PATH=/ pnpm build
const BASE_PATH = process.env.VITE_BASE_PATH ?? '/nurasik14/'

export default defineConfig({
  base: BASE_PATH,
  plugins: [react()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1200,
  },
})