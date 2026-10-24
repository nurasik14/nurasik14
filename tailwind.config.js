/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: [
          'JetBrains Mono',
          'Fira Code',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Consolas',
          'monospace',
        ],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        term: {
          green: '#22c55e',
          amber: '#f59e0b',
          cyan: '#06b6d4',
          red: '#ef4444',
          violet: '#a78bfa',
        },
        panel: '#0a0a0a',
      },
      fontSize: {
        '2xs': ['10px', '14px'],
        '3xs': ['9px', '12px'],
      },
      gridTemplateColumns: {
        dashboard: 'repeat(auto-fit, minmax(280px, 1fr))',
      },
    },
  },
  plugins: [],
};
