/* ================================================================ *
 *  projects.config.js — the three system modules on --projects
 *
 *  Each module: metadata + spec metrics + external links + tags.
 *  `slug` binds the module to its interactive widget in Projects.jsx.
 * ================================================================ */

export const PROJECTS = [
  {
    id: 'MOD-01',
    slug: 'trilingual-rag',
    name: 'trilingual_rag',
    status: 'ONLINE', // ONLINE | TRAINED | DEGRADED
    version: 'v0.9.4',
    tagline: 'Hybrid BM25 + dense retrieval over a 12k-document Kazakh / Russian / English corpus.',
    lang: 'Python 3.11 · PyTorch 2.4 · FAISS',
    runtime: 'cityu-node-01 · cpu:8 · mem:6.1GB',
    uptime: '99.94%',
    body: 'A retrieval stack built for agglutinative morphology. Sparse BM25 keeps exact-surface recall on Kazakh suffix chains; a multilingual dense encoder recovers cross-lingual matches that surface forms never share. Both ranked lists are fused, then a distilled cross-encoder reranks the top-100. Every ablation is pinned to a config and written to a JSONL ledger, so a run from three weeks ago is still comparable to one from today.',
    metrics: [
      { k: 'CORPUS', v: '12,408 docs' },
      { k: 'LANG MIX', v: 'kk 33% / ru 45% / en 22%' },
      { k: 'RECALL@5', v: '0.812' },
      { k: 'MRR@5', v: '0.744' },
      { k: 'nDCG@10', v: '0.769' },
      { k: 'p95 LATENCY', v: '61.2 ms' },
      { k: 'INDEX SIZE', v: '57.3 MB' },
      { k: 'CHUNK', v: '320 tok / 48 overlap' },
    ],
    links: [
      { label: '[VIEW_SOURCE]', href: 'https://github.com/nurasik14', tone: 'cyan' },
      { label: '[HUGGINGFACE_DATASET]', href: 'https://huggingface.co/Nurasik12', tone: 'amber' },
      { label: '[EVAL_LEDGER]', href: 'https://github.com/nurasik14', tone: 'default' },
    ],
    tags: ['#nlp', '#retrieval', '#rag', '#pipelines'],
  },
  {
    id: 'MOD-02',
    slug: 'dqn-flappy',
    name: 'dqn_flappy_bird',
    status: 'TRAINED',
    version: 'v1.3.0',
    tagline: 'Deep Q-Network agent with dueling heads, prioritized replay and frame stacking.',
    lang: 'Python 3.11 · PyTorch 2.4 · Gymnasium',
    runtime: 'rtx-3060 · 1.2k episodes · 3h 41m',
    uptime: '—',
    body: 'The agent sees four stacked grayscale frames and outputs Q-values over {flap, idle}. Reward shaping penalises vertical distance to the pipe gap, which cuts the exploration horizon dramatically versus terminal-only reward. Prioritized experience replay with proportional sampling and importance-weight correction keeps the loss monotone after episode ~400, and an epsilon floor of 0.01 preserves recovery behaviour when the policy enters states it has rarely visited.',
    metrics: [
      { k: 'EPISODES', v: '1,200' },
      { k: 'BEST PIPES', v: '61' },
      { k: 'FINAL REWARD', v: '58.7' },
      { k: 'FINAL LOSS', v: '0.048' },
      { k: 'REPLAY BUF', v: '100,000' },
      { k: 'EPS FLOOR', v: '0.01' },
      { k: 'STEP TIME', v: '2.4 ms' },
      { k: 'PARAMS', v: '1.42 M' },
    ],
    links: [
      { label: '[VIEW_SOURCE]', href: 'https://github.com/nurasik14', tone: 'cyan' },
      { label: '[WEIGHTS]', href: 'https://huggingface.co/Nurasik12', tone: 'amber' },
      { label: '[TB_LOGS]', href: 'https://github.com/nurasik14', tone: 'default' },
    ],
    tags: ['#rl', '#pytorch', '#vision'],
  },
  {
    id: 'MOD-03',
    slug: 'handsfree-cursor',
    name: 'handsfree_cursor',
    status: 'ONLINE',
    version: 'v0.7.2',
    tagline: 'MediaPipe pose-to-cursor mapping with intent gating — no mouse, no touch, no GPU.',
    lang: 'Python 3.11 · MediaPipe 0.10 · OpenCV',
    runtime: 'cpu-only · 640x480 @ 30fps',
    uptime: '99.71%',
    body: 'Wrist landmarks drive an absolute cursor via a Kalman-filtered affine map; a pinch between thumb and index fires click, and a dwell threshold gates it so accidental crossings never register. The whole loop is CPU-only: pose inference is 21 ms of the budget, the filter and mapping add 3 ms, and OS event injection costs the rest. Landmark dropout is handled by holding the last confident estimate for up to 90 ms before falling back to a dead zone.',
    metrics: [
      { k: 'p50 LATENCY', v: '31.4 ms' },
      { k: 'p95 LATENCY', v: '43.8 ms' },
      { k: 'FPS', v: '30 (29.4 avg)' },
      { k: 'LANDMARKS', v: '33 pose pts' },
      { k: 'CLICK ACC', v: '96.2%' },
      { k: 'FALSE CLICK', v: '1.8 / min' },
      { k: 'CPU LOAD', v: '38% (1 core)' },
      { k: 'MODEL', v: 'blazepose-full 3.1MB' },
    ],
    links: [
      { label: '[VIEW_SOURCE]', href: 'https://github.com/nurasik14', tone: 'cyan' },
      { label: '[DEMO_CLIP]', href: 'https://github.com/nurasik14', tone: 'amber' },
      { label: '[CALIBRATION]', href: 'https://github.com/nurasik14', tone: 'default' },
    ],
    tags: ['#cv', '#mediapipe', '#hci', '#realtime'],
  },
];
