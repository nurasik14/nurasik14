/** @type {import('tailwindcss').Config} */
// Design tokens: see docs/DESIGN.md. Colours resolve to CSS variables in
// src/index.css, so components never hard-code hex values.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './planner/index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono Variable"', '"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        sans: ['"Geist Variable"', 'Geist', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
      colors: {
        bg: v('bg'), // page canvas
        surface: { DEFAULT: v('surface'), 2: v('surface-2') }, // panels, raised rows
        line: { DEFAULT: v('line'), soft: v('line-soft'), strong: v('line-strong') },
        fg: { DEFAULT: v('fg'), dim: v('fg-dim'), faint: v('fg-faint') },
        signal: { DEFAULT: v('signal'), ink: v('signal-ink') }, // amber: cursor, primary action, seal
        ok: v('ok'), // sage: done / complete / strings
        info: v('info'), // steel: keys, running, links inside code
        warn: v('warn'), // rust: destructive, errors
      },
      maxWidth: { page: '1180px' },
    },
  },
  plugins: [],
};
