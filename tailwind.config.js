/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
        sans: ['Geist', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      colors: {
        term: {
          green: '#22c55e',
          amber: '#f59e0b',
          cyan: '#06b6d4',
        },
        panel: '#0a0a0a',
        line: { DEFAULT: '#262626', soft: '#1a1a1a' },
        'fg-dim': '#8a8a8a',
      },
    },
  },
  plugins: [],
};
