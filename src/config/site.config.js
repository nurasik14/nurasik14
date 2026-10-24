/* ================================================================ *
 *  site.config.js — identity, links, nav, top telemetry bar, crumbs
 *
 *  This is the single source of truth for "who is this page about".
 *  Every component reads from here — edit values, never touch JSX.
 * ================================================================ */

export const PROFILE = {
  handle: 'nurasik',
  host: 'cityu-node-01',
  name: 'Nurassyl Serikov',
  role: 'BSc Computer Science @ CityU HK',
  program: 'Full Scholarship · Tiger / Talents Program',
  location: 'Hong Kong SAR · Kowloon Tong',
  tz: 'UTC+8',
  links: {
    email: 'mailto:nurasik.s@my.cityu.edu.hk',
    emailText: 'nurasik.s@my.cityu.edu.hk',
    github: 'https://github.com/nurasik14',
    githubText: 'github.com/nurasik14',
    hf: 'https://huggingface.co/Nurasik12',
    hfText: 'huggingface.co/Nurasik12',
    linkedin: 'https://linkedin.com/in/nurasik12',
    linkedinText: 'linkedin.com/in/nurasik12',
  },
};

/* nav tabs — order matters; `key` is the keyboard shortcut (1-5) */
export const NAV = [
  { flag: '--about', label: 'about', key: '1' },
  { flag: '--projects', label: 'projects', key: '2' },
  { flag: '--dashboards', label: 'dashboards', key: '3' },
  { flag: '--blog', label: 'blog', key: '4' },
  { flag: '--contact', label: 'contact', key: '5' },
];

/* breadcrumb command line shown above each view */
export const CRUMB = {
  about: { cmd: 'cat README.md', path: '~' },
  projects: { cmd: 'ls -l ./modules', path: '~/modules' },
  dashboards: { cmd: 'grafana --open ./dashboards', path: '~/dashboards' },
  blog: { cmd: 'tail -n 200 /var/log/research.log', path: '/var/log' },
  contact: { cmd: './contact --all', path: '~' },
};

/* top telemetry bar — base values the live jitter is built around */
export const TOPBAR = {
  host: 'cityu-node-01',
  uptime: '99.97%',
  latencyBaseMs: 12, // base latency; jitter adds 0-6ms, rare spikes +22ms
  memBaseGb: 4.0, // displayed as "x.xGB / memTotalGbGB"
  memJitterGb: 0.7,
  memTotalGb: 16,
  loadBase: 0.4,
  loadJitter: 0.55,
  netInBase: 1.4, // MB/s
  netInJitter: 1.2,
  netOutBase: 0.2,
  netOutJitter: 0.5,
  threadsBase: 7,
  threadsJitter: 5,
  region: 'hk-south-1a',
  build: 'a3f9c21',
};

/* footer */
export const FOOTER = {
  builtWith: 'react 19 · vite · recharts',
  privacyNote: 'no cookies · no trackers · no analytics',
  region: 'hk-south-1a',
};
