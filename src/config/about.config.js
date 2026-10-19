/* ================================================================ *
 *  about.config.js — everything rendered on the --about view
 *
 *  Plain strings and arrays only. Components map over these.
 * ================================================================ */

export const README = {
  headline: 'Nurassyl Serikov',
  headlineRole: 'BSc Computer Science @ CityU HK',
  programLine: 'Full Scholar, Tiger / Talents Program',
  availabilityLine: 'Hong Kong SAR · UTC+8 · available for internships',
  focus: [
    'LLM systems & retrieval-augmented generation',
    'Low-resource multilingual NLP (Kazakh / Russian / English)',
    'Reinforcement learning & control',
    'Data pipelines & scraper infrastructure',
  ],
  bio: 'I build the layer between a model and the system it runs on: retrieval indices, evaluation harnesses, crawl fleets, and the telemetry that tells you whether any of it actually works. Most of my work is on languages that the tooling was not designed for — Kazakh is agglutinative, low-resource, and code-switched with Russian on the open web, which breaks most default assumptions about tokenisation, chunking and retrieval. I prefer measurable systems: every claim on this page is backed by a run recorded in a JSONL ledger.',
  operatingNotes: [
    'ships small, instruments everything, refuses unpinned experiments',
    'CPU-first: optimise for the hardware that actually exists',
    'reads papers for the ablation tables, not the abstract',
  ],
};

/* neofetch-style key/value rows in the right rail */
export const SYSTEM_PROFILE = [
  ['user', 'nurasik'],
  ['host', 'cityu-node-01'],
  ['os', 'CityU HK · BSc CS 2027'],
  ['kernel', 'ml-sys-2.4.1-cpu'],
  ['shell', '/bin/zsh'],
  ['editor', 'nvim + tmux'],
  ['wm', 'i3 (arch, btw)'],
  ['uptime', '99.97%'],
  ['pkgs', '412 commits / 90d'],
  ['locale', 'kk_KZ · ru_RU · en_HK'],
  ['tz', 'UTC+8 (HKT)'],
];

/* quick_stats metric cards (rendered as a 2/3/6-col grid) */
export const STATS = [
  { k: 'DEGREE', v: 'BSc CS', sub: 'CityU HK · 2023—2027' },
  { k: 'SCHOLARSHIP', v: 'FULL', sub: 'Tiger / Talents Program' },
  { k: 'COMPETITIONS', v: '2 MEDALS', sub: 'FAIO Bronze · StemCo Gold' },
  { k: 'DOMAIN', v: 'ML SYS', sub: 'NLP · RL · Retrieval' },
  { k: 'CORPORA SHIPPED', v: '3', sub: '12k+ documents' },
  { k: 'COMMITS (90d)', v: '412', sub: '8 repos · 4 languages' },
];

/* skill bars — group: 'core' (green) or 'aux' (cyan) */
export const STACK = [
  { name: 'PyTorch', lvl: 92, group: 'core' },
  { name: 'Hugging Face', lvl: 88, group: 'core' },
  { name: 'C++', lvl: 79, group: 'core' },
  { name: 'Docker', lvl: 74, group: 'core' },
  { name: 'Linux', lvl: 86, group: 'core' },
  { name: 'Python', lvl: 95, group: 'aux' },
  { name: 'FAISS / BM25', lvl: 81, group: 'aux' },
  { name: 'CUDA / Triton', lvl: 58, group: 'aux' },
  { name: 'SQL / DuckDB', lvl: 70, group: 'aux' },
  { name: 'Ray / Dask', lvl: 52, group: 'aux' },
];

/* competitions table — clicking a row shows `note`; tone: 'green'|'amber' */
export const COMPETITIONS = [
  {
    id: 'FAIO',
    name: 'FAIO — Finance AI Olympiad',
    award: 'BRONZE',
    year: '2025',
    track: 'Applied ML / forecasting',
    note: 'Ranked top-tier bracket on a quantitative forecasting track; shipped an ensemble of gradient-boosted trees over engineered tick/orderbook features.',
    tone: 'amber',
  },
  {
    id: 'StemCo',
    name: 'StemCo International Olympiad',
    award: 'GOLD',
    year: '2024',
    track: 'Algorithms / systems',
    note: 'Gold-tier placement; solved constraint-optimisation and graph traversal problems under a hard time budget in C++.',
    tone: 'green',
  },
];

/* event_log rows — tone: 'green'|'amber'|'cyan'|'neutral' */
export const TIMELINE = [
  { t: '2023.09', e: 'enrolled · BSc CS, CityU HK', tone: 'cyan' },
  { t: '2024.03', e: 'StemCo Olympiad — GOLD', tone: 'amber' },
  { t: '2024.11', e: 'first scraper fleet deployed (6 jobs)', tone: 'neutral' },
  { t: '2025.04', e: 'FAIO — BRONZE', tone: 'amber' },
  { t: '2025.08', e: 'trilingual RAG corpus published on HF', tone: 'green' },
  { t: '2025.11', e: 'hybrid retrieval ablation → Recall@5 0.812', tone: 'green' },
];

/* --contact view: availability cards + pitch paragraph */
export const AVAILABILITY = [
  { k: 'STATUS', v: 'OPEN', tone: 'green', sub: 'internships · RA · collab' },
  { k: 'TIMEZONE', v: 'UTC+8', tone: 'default', sub: 'Hong Kong SAR' },
  { k: 'RESPONSE', v: '< 24h', tone: 'default', sub: 'email · faster on gh' },
  { k: 'LOCATION', v: 'Kowloon Tong', tone: 'default', sub: 'CityU HK campus' },
  { k: 'INTERESTS', v: 'ML SYS', tone: 'cyan', sub: 'retrieval · RL · pipelines' },
  { k: 'LANGUAGES', v: 'kk / ru / en', tone: 'default', sub: 'native · native · fluent' },
];

export const LOOKING_FOR =
  'ML engineering or research internships where the work is measurable: retrieval systems, evaluation infrastructure, training pipelines, or anything that ships to real users on CPUs. I am especially interested in low-resource language work — if your product touches Central Asia, I have the corpora.';
