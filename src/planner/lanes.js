// Lay plans out as horizontal bars on a month grid.
import { compareDates } from './dates.js';
import { doneCount, sortPlans } from '../../plugins/planner-core.js';

/**
 * Greedy lane assignment for the plans visible between `first` and `last`
 * (inclusive). Plans are taken in start/sealedAt order and each goes into the
 * lowest lane that is free on its first day, so the layout is deterministic
 * and a plan keeps one lane across every week row of the view.
 */
export function assignLanes(plans, first, last) {
  const visible = sortPlans(plans.filter((p) => compareDates(p.end, first) >= 0 && compareDates(p.start, last) <= 0));
  const laneEnds = [];
  const lanes = new Map();
  for (const plan of visible) {
    let lane = laneEnds.findIndex((end) => compareDates(end, plan.start) < 0);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = plan.end;
    lanes.set(plan.id, lane);
  }
  return { visible, lanes };
}

/**
 * Split plans into one segment per week row:
 * [{ week, lanes: n, segments: [{ plan, lane, from, to, label, startsHere, endsHere }] }]
 * `from`/`to` are 0..6 column indexes. `label` marks the first segment of
 * each plan in the view, which carries the title.
 */
export function layoutWeeks(weeks, plans) {
  if (!weeks.length) return [];
  const first = weeks[0].days[0];
  const last = weeks.at(-1).days[6];
  const { visible, lanes } = assignLanes(plans, first, last);
  const labelled = new Set();
  return weeks.map(({ week, days }) => {
    const segments = [];
    for (const plan of visible) {
      if (compareDates(plan.end, days[0]) < 0 || compareDates(plan.start, days[6]) > 0) continue;
      const startsHere = compareDates(plan.start, days[0]) >= 0;
      const endsHere = compareDates(plan.end, days[6]) <= 0;
      const from = startsHere ? days.indexOf(plan.start) : 0;
      const to = endsHere ? days.indexOf(plan.end) : 6;
      const label = !labelled.has(plan.id);
      labelled.add(plan.id);
      segments.push({ plan, lane: lanes.get(plan.id), from, to, label, startsHere, endsHere });
    }
    const laneCount = segments.reduce((n, s) => Math.max(n, s.lane + 1), 0);
    return { week, days, lanes: laneCount, segments };
  });
}

/** Plans covering `day`, in lane order. */
export const plansOn = (plans, day) => sortPlans(plans.filter((p) => compareDates(p.start, day) <= 0 && compareDates(p.end, day) >= 0));

/** 'none' | 'some' | 'all' — drives the bar tint; always paired with text. */
export function progressState(plan) {
  const done = doneCount(plan);
  if (done === 0) return 'none';
  return done === plan.tasks.length ? 'all' : 'some';
}

/** "now" | "upcoming" | "past" relative to `today`. */
export function planPhase(plan, today) {
  if (compareDates(plan.end, today) < 0) return 'past';
  if (compareDates(plan.start, today) > 0) return 'upcoming';
  return 'now';
}
