/* ================================================================ *
 *  portfolio.config.js — every word and number on the site
 *
 *  Edit this file for content changes; components only render it.
 *  Rule for this page: only put a number here if a log, repo or
 *  certificate backs it. Unmeasured work gets `stats: 'empty'`.
 * ================================================================ */

export const PROFILE = {
  name: 'Nurassyl Serikov',
  handle: 'nurassyl', // the top bar's ~/nurassyl home link
  github: 'nurasik14', // the username line under the name
  // Real GitHub avatar. If it fails to load, the sidebar shows `monogram`.
  avatar: 'https://avatars.githubusercontent.com/u/76750044?v=4',
  monogram: 'NS',
  // Not shown on the page (the bio says it); kept as the one-line role.
  role: 'first-year CS student, City University of Hong Kong',
  school: 'City University of Hong Kong',
  degree: 'BSc CS 2026-2030',
  location: 'Hong Kong',
  // The sidebar pill shows this with " · " in place of ", ".
  status: 'open to AI/ML internships, summer 2027',
  focus: ['LLM agents', 'reinforcement learning', 'retrieval'],
  // Sidebar bio, short like a GitHub bio (the lede, trimmed).
  bio: 'First-year CS student at City University of Hong Kong, on a full scholarship. I build agents that call tools and train RL models.',
  // The intro paragraph in the README.md panel, above the "now" list and fig. 1.
  intro:
    'I keep the training logs to prove what my models did: fig. 1 is two DQN variants learning Flappy Bird from reward alone. Every number on this page comes from a log, a repo or a certificate, and work that is not measured yet says so.',
  // Put the PDF at public/Nurassyl_Serikov_CV.pdf and it is served from here.
  cv: 'Nurassyl_Serikov_CV.pdf',
  email: 'nurasik.s@my.cityu.edu.hk',
  contactNote: 'Email is the fastest way to reach me.',
  // `prefix` without the slash is also the command-line name (:gh, :hf, :in).
  links: [
    { prefix: 'gh/', label: 'nurasik14', href: 'https://github.com/nurasik14' },
    { prefix: 'hf/', label: 'Nurasik12', href: 'https://huggingface.co/Nurasik12' },
    { prefix: 'in/', label: 'nurasik12', href: 'https://linkedin.com/in/nurasik12' },
  ],
};

/* ---- now: the "### now" list in the README.md panel --------------- */
export const NOW = [
  'Building a Kazakh retriever to beat the KazQAD baseline',
  'Building a voice layer for my agent setup: Hermes as the brain, Claude Code as the hands, streaming STT/TTS as the voice, steerable mid-task',
  'CS freshman at CityU (linear algebra, probability, algorithms)',
];

/* ---- DQN training logs (FlappyBird-RL/runs/graphs/*.log) ----------
 * [episode, best reward so far]. Copied from the "new best reward"
 * lines. flappybird2 = Double DQN, flappybird3 = Dueling DQN.
 * Drawn as fig. 1 in the hero and summarised in the train_dqn row.   */
export const DQN_RUNS = {
  double: [
    [0, -8.7], [11969, 4.3], [22279, 9.1], [66065, 12.9], [76205, 22.4], [93710, 29.5],
    [109213, 46.0], [133591, 50.4], [146897, 51.5], [165004, 51.6], [168126, 53.1],
  ],
  dueling: [
    [0, -8.7], [1583, 3.9], [10737, 4.6], [18479, 6.7], [26804, 10.7], [32446, 12.9], [34422, 15.2],
  ],
};

/* ---- tech stack: [name, group] ------------------------------------
 * Rendered as a package manifest in "## 04 stack", grouped by the
 * second field in order of first appearance.                         */
export const TOOLS = [
  ['python', 'lang'], ['pytorch', 'ml'], ['hugging face', 'ml'], ['scikit-learn', 'ml'],
  ['numpy', 'data'], ['pandas', 'data'], ['ollama', 'llm'], ['claude api', 'llm'],
  ['fastapi', 'api'], ['opencv', 'cv'], ['mediapipe', 'cv'], ['gymnasium', 'rl'],
  ['typescript', 'lang'], ['react', 'web'], ['node.js', 'web'], ['postgresql', 'db'],
  ['docker', 'ops'], ['linux', 'ops'], ['git', 'ops'], ['playwright', 'test'],
  ['hermes agent', 'harness'], ['claude code', 'harness'], ['mcp', 'llm'], ['svelte', 'web'],
  ['bun', 'web'], ['hono', 'api'], ['qml / quickshell', 'desktop'],
];

/* ---- language dots on the pinned cards -----------------------------
 * GitHub linguist colours. A stack item named here gets a filled dot in
 * its colour; libraries and tools get a hollow dot. The name is always
 * written next to the dot, so the colour is never the only signal.    */
export const LANG_COLORS = {
  python: '#3572A5',
  typescript: '#3178c6',
  javascript: '#f1e05a',
  qml: '#44a51c',
  shell: '#89e051',
};

/* ---- projects: the pinned cards in "## 01 projects" -----------------
 * Array order = pin order. 'archived' projects are listed compactly
 * under the cards instead of getting a card.
 * id: unique; the card is deep-linkable as #project-<id>
 * status: 'complete' | 'running' | 'archived'
 * result: one line on the card. Only measured numbers; if nothing is
 *         measured yet, say so.
 * stack: optional; falls back to input.stack
 * input: rendered as YAML under "details" (inputFile names the block);
 *        a `repo` value ("owner/name") also links the card's name.
 * stats: 'dqn' | 'search' | 'rag' | { empty: title, note }
 * defaultOpen: true opens that project's details on load.             */
export const PROJECTS = [
  {
    id: 'dqn',
    name: 'train_dqn',
    status: 'complete',
    // Same numbers as the last DQN_RUNS.double point; keep them in sync.
    result: 'Double DQN: best reward 53.1 after 168,126 episodes',
    description:
      'A PyTorch agent that learns to play Flappy Bird from reward alone. I trained Double and Dueling DQN and compared them.',
    inputFile: 'config.yaml',
    input: {
      env: 'FlappyBird-v0',
      methods: ['double_dqn', 'dueling_dqn'],
      hidden_units: 512,
      replay_size: 100000,
      batch_size: 32,
      lr: 1e-4,
      gamma: 0.99,
      stack: ['pytorch', 'gymnasium'],
      based_on: "Jonny Code's DQN series",
      repo: 'nurasik14/FlappyBird-RL',
    },
    statsFile: 'runs/graphs/*.log',
    stats: 'dqn',
  },
  {
    id: 'overworld',
    name: 'overworld-hyprland',
    status: 'complete',
    result: '19 stars on GitHub',
    stack: ['qml', 'quickshell', 'hyprland'],
    description:
      'Minecraft as a Linux desktop: hotbar workspaces, creative-inventory launcher, advancement toasts, chat commands, an F3 screen, real weather and day/night.',
    inputFile: 'shell.yaml',
    input: {
      compositor: 'hyprland',
      shell: 'quickshell (qml)',
      workspaces: 'hotbar',
      launcher: 'creative inventory',
      extras: ['advancement toasts', 'chat commands', 'F3 screen', 'weather', 'day/night'],
      repo: 'nurasik14/overworld-hyprland',
    },
    stats: { empty: 'desktop theme, no benchmark', note: 'Screenshots and install steps are in the repo.' },
  },
  {
    id: 'lastfm',
    name: 'lastfm-taste-mcp',
    status: 'complete',
    result: '24 read-only tools',
    stack: ['python', 'mcp'],
    description:
      'A read-only MCP server that lets an AI agent look at your Last.fm listening history: this week, most-played songs, loved tracks and similar music.',
    inputFile: 'server.yaml',
    input: {
      protocol: 'mcp',
      source: 'Last.fm',
      access: 'read-only',
      tools: 24,
      repo: 'nurasik14/lastfm-taste-mcp',
    },
    stats: { empty: 'tool server, no benchmark', note: 'Nothing is measured here; the repo has the code.' },
  },
  {
    id: 'quests',
    name: 'apothecaries_quests',
    status: 'complete',
    result: 'PWA; self-hosted',
    stack: ['typescript', 'bun', 'hono', 'svelte'],
    description:
      'Self-hosted daily quest journal: an LLM writes three real-life quests sized to your energy, you rate the day at night, finished quests buy real treats. Works with Claude, Ollama or any OpenAI-compatible API.',
    inputFile: 'app.yaml',
    input: {
      app: 'pwa, self-hosted',
      quests_per_day: 3,
      llm: ['claude', 'ollama', 'openai-compatible'],
      repo: 'nurasik14/Apothecaries-quests',
    },
    stats: { empty: 'app, no benchmark', note: 'Nothing is measured here; the repo has the code.' },
  },
  {
    id: 'search',
    name: 'ollama_search',
    status: 'complete',
    result: 'both search modes built; not benchmarked yet',
    stack: ['ollama', 'searxng'],
    description:
      "Two ways to give a local LLM web search, built and compared: the model's native tool calling, and my own tool on a self-hosted SearXNG engine.",
    inputFile: 'tools.yaml',
    input: {
      mode: ['native', 'searxng'],
      runtime: 'ollama (local)',
      compared_on: ['answer quality', 'source control', 'privacy'],
      repo: 'nurasik14/OllamaSearch',
    },
    statsFile: 'architecture',
    stats: 'search',
  },
  {
    id: 'rag',
    name: 'kazakh_rag',
    status: 'running',
    result: 'design phase; no code or results yet',
    stack: ['python', 'hugging face'],
    description:
      'A retriever for Kazakh questions over a Kazakh corpus, aiming to beat the published KazQAD baseline (NDCG@10 0.389). Started as trilingual kk/ru/en and narrowed to Kazakh for v1.',
    inputFile: 'eval.yaml',
    input: {
      lang: 'kk',
      benchmark: 'KazQAD',
      baseline: { 'ndcg@10': 0.389 },
      metrics: ['ndcg@10', 'mrr'],
      repo: 'nurasik14/Kazakh-RAG',
    },
    statsFile: 'ndcg@10 · mrr',
    stats: 'rag',
  },
  {
    id: 'memory',
    name: 'character_memory',
    status: 'archived',
    result: 'prototype; code not published',
    description: 'LLM characters that remember earlier conversations through an embedding store.',
    input: { store: 'embeddings', stack: ['python', 'llm', 'embeddings'], memory: 'retrieve past turns by similarity' },
    stats: { empty: 'prototype, code not published', note: "I'm rebuilding it in public. This entry will link the repo when it's up." },
  },
  {
    id: 'cursor',
    name: 'handsfree_cursor',
    status: 'archived',
    result: 'experiment; code not published',
    description: 'Moving the mouse with body landmarks from MediaPipe, for people with limited mobility.',
    input: { input: 'pose', stack: ['opencv', 'mediapipe'], maps: 'body landmarks -> cursor position' },
    stats: { empty: 'experiment, code not published', note: 'Next version will measure cursor smoothing and latency.' },
  },
];

/* ---- experience (newest first) ------------------------------------ */
export const EXPERIENCE = [
  {
    when: '2025-10 → 2025-11',
    org: 'AuaLine',
    role: 'frontend / full-stack intern, Almaty',
    note: "Built and deployed the company's online store in five weeks: product catalog, WhatsApp checkout and a contact form, working on desktop and mobile.",
    tags: ['typescript', 'node.js', 'html/css'],
  },
  {
    when: '2025-01',
    org: 'KBTU Data Camp',
    role: 'finalist, 48-hour challenge',
    note: 'Forecast earthquake occurrence around Kazakhstan from seismic time series, with seasonality-aware preprocessing and LSTM networks.',
    tags: ['lstm', 'time series', 'python'],
  },
  {
    when: '2025',
    org: 'Turgor Olympiad',
    role: 'organizer, Taraz',
    note: 'Ran the local mathematics olympiad for 30 students.',
  },
];

/* ---- awards: medal is 'gold' | 'bronze' | 'merit' -----------------
 * `label` is the word shown (e.g. '2× gold'); `medal` picks the glyph. */
export const AWARDS = [
  { medal: 'bronze', label: 'bronze', title: 'International AI Olympiad (FAIO)', note: 'Top 7.1% of 291+ participants', year: 2025 },
  { medal: 'gold', label: 'gold', title: 'StemCo Global Sciences, Singapore', note: 'Plus two bronze. Top 0.1% of 12,000+', year: 2025 },
  { medal: 'merit', label: 'merit', title: 'BestYs National Merit Scholarship', note: 'Only recipient in Kazakhstan, 1,000+ applied', year: 2025 },
  { medal: 'gold', label: '2× gold', title: 'StemCo International Science Olympiad', year: 2024 },
  { medal: 'bronze', label: 'bronze', title: 'Iranian Geometry Olympiad, and AIMO', note: '1,245 in the geometry olympiad', year: 2024 },
];

/* ---- education: rendered as a YAML block --------------------------
 * fields: [key, value, optional # comment]. Values may be strings,
 * numbers, arrays (flow list) or flat objects (flow mapping).        */
export const EDUCATION = [
  {
    key: 'cityu',
    fields: [
      ['degree', 'BSc Computer Science'],
      ['years', '2026-2030'],
      ['funding', 'full scholarship'],
      ['program', 'Tiger/Talents'],
      ['taking', ['linear algebra', 'probability', 'data structures', 'algorithms']],
    ],
  },
  {
    key: 'nis_taraz',
    fields: [
      ['years', '2020-2026'],
      ['gpa', '4.78/5'],
      ['sat', '1520', 'math 800'],
      ['ielts', '7.0'],
      ['a_levels', { physics: 'A*', cs: 'A*', math: 'A' }],
    ],
  },
];
export const LANGUAGES = ['kazakh', 'russian', 'english'];
// Short codes for the sidebar (screen readers get the full name).
export const LANG_CODES = { kazakh: 'kk', russian: 'ru', english: 'en' };
