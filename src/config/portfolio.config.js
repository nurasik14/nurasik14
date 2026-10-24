/* ================================================================ *
 *  portfolio.config.js — every word and number on the site
 *
 *  Edit this file for content changes; components only render it.
 *  Rule for this page: only put a number here if a log, repo or
 *  certificate backs it. Unmeasured work gets `stats: 'empty'`.
 * ================================================================ */

export const PROFILE = {
  name: 'Nurassyl Serikov',
  handle: 'nurassyl',
  status: 'open to AI/ML internships in Hong Kong',
  focus: ['LLM agents', 'reinforcement learning', 'retrieval'],
  lede:
    "I'm a first-year Computer Science student at City University of Hong Kong, on a full scholarship. I build agents that call tools, train RL models, and keep the training logs to prove what they did.",
  // Put the PDF at public/Nurassyl_Serikov_CV.pdf and it is served from here.
  cv: 'Nurassyl_Serikov_CV.pdf',
  email: 'nurasik.s@my.cityu.edu.hk',
  links: [
    { prefix: 'gh/', label: 'nurasik14', href: 'https://github.com/nurasik14' },
    { prefix: 'hf/', label: 'Nurasik12', href: 'https://huggingface.co/Nurasik12' },
    { prefix: 'in/', label: 'nurasik12', href: 'https://linkedin.com/in/nurasik12' },
  ],
};

/* ---- DQN training logs (FlappyBird-RL/runs/graphs/*.log) ----------
 * [episode, best reward so far]. Copied from the "new best reward"
 * lines. flappybird2 = Double DQN, flappybird3 = Dueling DQN.        */
export const DQN_RUNS = {
  double: [
    [0, -8.7], [11969, 4.3], [22279, 9.1], [66065, 12.9], [76205, 22.4], [93710, 29.5],
    [109213, 46.0], [133591, 50.4], [146897, 51.5], [165004, 51.6], [168126, 53.1],
  ],
  dueling: [
    [0, -8.7], [1583, 3.9], [10737, 4.6], [18479, 6.7], [26804, 10.7], [32446, 12.9], [34422, 15.2],
  ],
};

/* ---- hero: the agent run that introduces me ----------------------
 * `out` is rendered as a JSON-ish line; `spark: true` adds the DQN curve. */
export const AGENT_RUN = {
  prompt: "Summarize Nurassyl Serikov's work.",
  steps: [
    { fn: 'read_profile', arg: '"nurasik14"', out: { school: 'CityU', degree: 'BSc CS', years: '2026-2030', scholarship: 'full' } },
    { fn: 'read_log', arg: '"FlappyBird-RL/runs/flappybird2.log"', out: 'best_reward -8.7 → 53.1 over 168,126 episodes', spark: true },
    { fn: 'list_repos', arg: 'topic="agents"', out: ['OllamaSearch', 'Visual-UI-for-an-AI-agent'] },
    { fn: 'list_awards', arg: 'limit=3', out: ['FAIO 2025 bronze', 'StemCo 2025 gold', 'BestYs scholarship'] },
  ],
  answer:
    'A CityU CS student who ships small, measurable ML projects: a DQN agent that reached a best reward of 53.1, and local LLM agents with their own search tool. Medals in AI and science olympiads. Looking for an internship.',
};

/* ---- tech stack (LogoLoop) ---------------------------------------- */
export const TOOLS = [
  ['python', 'lang'], ['pytorch', 'ml'], ['hugging face', 'ml'], ['scikit-learn', 'ml'],
  ['numpy', 'data'], ['pandas', 'data'], ['ollama', 'llm'], ['claude api', 'llm'],
  ['fastapi', 'api'], ['opencv', 'cv'], ['mediapipe', 'cv'], ['gymnasium', 'rl'],
  ['typescript', 'lang'], ['react', 'web'], ['node.js', 'web'], ['postgresql', 'db'],
  ['docker', 'ops'], ['linux', 'ops'], ['git', 'ops'], ['playwright', 'test'],
];

/* ---- projects (ToolCallVisualizer) --------------------------------
 * status: 'complete' | 'running' | 'archived'
 * The first `input` entry becomes the signature: name(key=value).
 * stats: 'dqn' | 'search' | 'rag' | { empty: title, note }          */
export const PROJECTS = [
  {
    id: 'dqn',
    name: 'train_dqn',
    status: 'complete',
    defaultOpen: true,
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
    id: 'search',
    name: 'ollama_search',
    status: 'complete',
    description:
      "Two ways to give a local LLM web search, built and compared: the model's native tool calling, and my own tool on a self-hosted SearXNG engine.",
    inputFile: 'tools.json',
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
    name: 'trilingual_rag',
    status: 'running',
    description:
      'Question answering over Kazakh, Russian and English documents, comparing dense and hybrid retrieval.',
    inputFile: 'eval.json',
    input: {
      langs: ['kk', 'ru', 'en'],
      retrieval: ['dense', 'hybrid'],
      compare: 'multilingual embedding models',
      metric: 'recall@5',
      stack: ['python', 'hugging face', 'vector db'],
    },
    statsFile: 'recall@5',
    stats: 'rag',
  },
  {
    id: 'memory',
    name: 'character_memory',
    status: 'archived',
    description: 'LLM characters that remember earlier conversations through an embedding store.',
    input: { store: 'embeddings', stack: ['python', 'llm', 'embeddings'], memory: 'retrieve past turns by similarity' },
    stats: { empty: 'prototype, code not published', note: "I'm rebuilding it in public. This card will link the repo when it's up." },
  },
  {
    id: 'cursor',
    name: 'handsfree_cursor',
    status: 'archived',
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

/* ---- awards: medal is 'gold' | 'bronze' | 'merit' ----------------- */
export const AWARDS = [
  { medal: 'bronze', label: 'bronze', title: 'International AI Olympiad (FAIO)', note: 'Top 7.1% of 291+ participants', year: 2025 },
  { medal: 'gold', label: 'gold', title: 'StemCo Global Sciences, Singapore', note: 'Plus two bronze. Top 0.1% of 12,000+', year: 2025 },
  { medal: 'merit', label: 'merit', title: 'BestYs National Merit Scholarship', note: 'Only recipient in Kazakhstan, 1,000+ applied', year: 2025 },
  { medal: 'gold', label: '2× gold', title: 'StemCo International Science Olympiad', year: 2024 },
  { medal: 'bronze', label: 'bronze', title: 'Iranian Geometry Olympiad, and AIMO', note: '1,245 in the geometry olympiad', year: 2024 },
];

/* ---- education: rendered as a YAML block -------------------------- */
export const EDUCATION = [
  {
    key: 'cityu',
    fields: [
      ['degree', 'BSc Computer Science'],
      ['years', '2026-2030'],
      ['funding', 'full scholarship'],
      ['program', 'Tiger/Talents'],
      // \n + spaces continues a long value on the next line, aligned under the "["
      ['taking', '[linear algebra, probability,\n           data structures, algorithms]'],
    ],
  },
  {
    key: 'nis_taraz',
    fields: [
      ['years', '2020-2026'],
      ['gpa', '4.78/5'],
      ['sat', '1520', 'math 800'],
      ['ielts', '7.0'],
      ['a_levels', '{physics: A*, cs: A*, math: A}'],
    ],
  },
];
export const LANGUAGES = ['kazakh', 'russian', 'english'];
