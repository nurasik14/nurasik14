import { describe, expect, test } from 'bun:test';
import { monthGrid } from '../../src/planner/dates.js';
import { assignLanes, layoutWeeks, planPhase, plansOn, progressState } from '../../src/planner/lanes.js';

const plan = (id, start, end, sealedAt = '2025-01-01T00:00:00Z', tasks = [{ text: 't', done: false }]) => ({ id, start, end, sealedAt, tasks });

describe('assignLanes', () => {
  test('reuses the lowest free lane', () => {
    const plans = [plan('a', '2025-11-03', '2025-11-05'), plan('b', '2025-11-04', '2025-11-10'), plan('c', '2025-11-06', '2025-11-07')];
    const { lanes } = assignLanes(plans, '2025-10-27', '2025-11-30');
    expect([lanes.get('a'), lanes.get('b'), lanes.get('c')]).toEqual([0, 1, 0]);
  });
  test('ignores plans outside the view', () => {
    const { visible } = assignLanes([plan('x', '2025-09-01', '2025-09-02')], '2025-10-27', '2025-11-30');
    expect(visible).toEqual([]);
  });
});

describe('layoutWeeks', () => {
  test('splits a plan per week row and labels only the first segment', () => {
    // Nov 2025 grid starts Mon Oct 27; this plan runs Thu Nov 6 → Tue Nov 18
    const rows = layoutWeeks(monthGrid('2025-11'), [plan('p', '2025-11-06', '2025-11-18')]);
    const segs = rows.flatMap((r, i) => r.segments.map((s) => ({ row: i, from: s.from, to: s.to, label: s.label, s: s.startsHere, e: s.endsHere })));
    expect(segs).toEqual([
      { row: 1, from: 3, to: 6, label: true, s: true, e: false },
      { row: 2, from: 0, to: 6, label: false, s: false, e: false },
      { row: 3, from: 0, to: 1, label: false, s: false, e: true },
    ]);
    expect(rows.map((r) => r.lanes)).toEqual([0, 1, 1, 1, 0]);
  });
  test('a plan starting before the view is labelled on its first visible row', () => {
    const rows = layoutWeeks(monthGrid('2025-11'), [plan('p', '2025-10-01', '2025-10-29')]);
    expect(rows[0].segments[0]).toMatchObject({ from: 0, to: 2, label: true, startsHere: false, endsHere: true });
  });
});

describe('helpers', () => {
  test('plansOn and phases', () => {
    const a = plan('a', '2025-11-03', '2025-11-05');
    expect(plansOn([a], '2025-11-05')).toHaveLength(1);
    expect(plansOn([a], '2025-11-06')).toHaveLength(0);
    expect(planPhase(a, '2025-11-04')).toBe('now');
    expect(planPhase(a, '2025-11-01')).toBe('upcoming');
    expect(planPhase(a, '2025-11-06')).toBe('past');
  });
  test('progressState', () => {
    expect(progressState(plan('a', '2025-11-03', '2025-11-05'))).toBe('none');
    expect(progressState(plan('a', '2025-11-03', '2025-11-05', 'x', [{ done: true }, { done: false }]))).toBe('some');
    expect(progressState(plan('a', '2025-11-03', '2025-11-05', 'x', [{ done: true }]))).toBe('all');
  });
});
