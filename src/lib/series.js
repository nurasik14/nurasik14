import { mulberry32, gauss } from './rand';
import { DQN, CURSOR } from '../config/experiments.config';
import { ANALYTICS_PARAMS } from '../config/dashboards.config';

/* ------------------------------------------------------------ *
 * Deterministic telemetry series — every reload renders the same
 * curves because they are all seeded from experiments.config.
 * ------------------------------------------------------------ */

function buildDqn() {
  const rnd = mulberry32(DQN.seed);
  const out = [];
  let skill = 0;
  for (let ep = 0; ep < DQN.episodes; ep++) {
    skill = Math.min(1, skill + 0.0016 + gauss(rnd, 0, 0.0012));
    const eps = Math.max(DQN.epsFloor, DQN.epsStart * Math.pow(DQN.epsDecay, ep));
    const plateau = skill < 0.25 ? 0 : (skill - 0.25) * 1.33;
    const pipes = Math.max(0, Math.round(plateau * 46 + gauss(rnd, 0, 3.1)));
    const reward = Math.max(-6, pipes * 1.0 - 3.2 + gauss(rnd, 0, 4.4));
    const loss = Math.max(
      0.02,
      (0.92 * Math.exp(-ep / 260) + 0.055) * (1 + gauss(rnd, 0, 0.16)) + 0.02,
    );
    out.push({
      ep,
      reward: +reward.toFixed(2),
      pipes,
      loss: +loss.toFixed(4),
      eps: +eps.toFixed(4),
      qmax: +(pipes * 0.62 + 4.1 + gauss(rnd, 0, 1.4)).toFixed(2),
      steps: Math.round(pipes * 18 + 34 + gauss(rnd, 0, 22)),
    });
  }
  return out;
}

export const DQN_SERIES = buildDqn();
export const DQN_CHECKPOINTS = DQN.checkpoints;

/* ---- MediaPipe cursor latency samples ---- */
function buildLatency() {
  const rnd = mulberry32(CURSOR.latSeed);
  const s = [];
  for (let i = 0; i < CURSOR.latSamples; i++) {
    const spike = rnd() > 0.975 ? gauss(rnd, 26, 9) : 0;
    s.push(Math.max(11.2, gauss(rnd, 31.4, 6.1) + spike));
  }
  return s;
}

export const LAT_SAMPLES = buildLatency();

export function histogram(values, bins = 18) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const w = (hi - lo) / bins || 1;
  const out = Array.from({ length: bins }, (_, i) => ({
    bin: +(lo + i * w).toFixed(1),
    edge: `${(lo + i * w).toFixed(0)}-${(lo + (i + 1) * w).toFixed(0)}`,
    n: 0,
  }));
  values.forEach((v) => {
    const i = Math.min(bins - 1, Math.floor((v - lo) / w));
    out[i].n += 1;
  });
  return out;
}

export function percentile(values, p) {
  const s = [...values].sort((a, b) => a - b);
  return +s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))].toFixed(1);
}

/* ---- 24h analytics window (5-min buckets) ---- */
function buildAnalytics() {
  const P = ANALYTICS_PARAMS;
  const rnd = mulberry32(P.seed);
  const now = Date.now();
  const out = [];
  for (let i = P.buckets - 1; i >= 0; i--) {
    const t = now - i * P.bucketMs;
    const hour = new Date(t).getHours() + new Date(t).getMinutes() / 60;
    const diurnal = 0.55 + 0.45 * Math.sin(((hour - 4) / 24) * 2 * Math.PI);
    const burst = rnd() > 0.965 ? 2.4 : 1;
    out.push({
      t,
      ts: new Date(t).toISOString().slice(11, 16),
      ingested: Math.max(
        0,
        Math.round((P.baseRate + P.diurnalAmplitude * diurnal) * (1 + gauss(rnd, 0, 0.14)) * burst),
      ),
      errors: Math.max(0, Math.round(gauss(rnd, 2.1, 1.8) * burst)),
      p50: +(P.baseP50 + gauss(rnd, 0, 3.2) + (burst > 1 ? 9 : 0)).toFixed(1),
      p95: +(P.baseP95 + gauss(rnd, 0, 7.4) + (burst > 1 ? 21 : 0)).toFixed(1),
      queue: Math.max(0, Math.round(P.baseQueue + 48 * diurnal + gauss(rnd, 0, 9))),
    });
  }
  return out;
}

export const ANALYTICS = buildAnalytics();
