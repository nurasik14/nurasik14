/* ================================================================ *
 *  experiments.config.js — parameters for the interactive widgets
 *
 *  All series are generated deterministically from these seeds, so
 *  editing a value here changes the whole chart coherently.
 * ================================================================ */

/* ---- DQN training telemetry ---- */
export const DQN = {
  seed: 0x5eed01, // deterministic curve; change for a different run
  episodes: 1200,
  epsStart: 1.0,
  epsDecay: 0.9965,
  epsFloor: 0.01,
  // checkpoints shown in the table + scrub shortcuts
  checkpoints: [
    { ep: 0, tag: 'init', reward: -3.4, pipes: 0, loss: 0.94, eps: 1.0, note: 'random policy' },
    { ep: 150, tag: 'warmup', reward: 1.2, pipes: 4, loss: 0.41, eps: 0.59, note: 'replay filled' },
    { ep: 400, tag: 'early', reward: 14.8, pipes: 17, loss: 0.13, eps: 0.24, note: 'first gap clears' },
    { ep: 800, tag: 'mid', reward: 41.5, pipes: 42, loss: 0.071, eps: 0.06, note: 'stable flight' },
    { ep: 1199, tag: 'final', reward: 58.7, pipes: 61, loss: 0.048, eps: 0.01, note: 'converged' },
  ],
  footerParams:
    'frame_stack=4 · 84x84 gray · dueling head · target_sync=1000 · γ=0.99 · lr=1e-4 (adam)',
};

/* ---- MediaPipe cursor ---- */
export const CURSOR = {
  viewW: 480,
  viewH: 360,
  screenW: 1920,
  screenH: 1080,
  latSeed: 0xbeef22,
  latSamples: 640,
  // latency model constants (ms): inference + filter + injection + frame
  model: { pose: 21.6, filter: 1.2, inject: 2.2, frameCap: 12, jitter: 4.6 },
  // stage breakdown shown under the histogram
  stages: [
    { k: 'capture (v4l2 mmap)', v: 4.1 },
    { k: 'resize + rgb', v: 2.3 },
    { k: 'pose inference', v: 21.6 },
    { k: 'kalman + affine', v: 1.2 },
    { k: 'event injection', v: 2.2 },
  ],
  note: 'budget: sub-50ms end-to-end on 1 CPU core. Outliers above 90ms are landmark dropouts — held-pose extrapolation caps perceived jitter at p99 74ms.',
};
