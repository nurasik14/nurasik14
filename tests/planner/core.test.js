import { createHash } from 'node:crypto';
import { describe, expect, test } from 'bun:test';
import {
  assertStore,
  canonical,
  hashPlan,
  normalizeTasks,
  sealPlan,
  serializeStore,
  sortPlans,
  toggleTask,
  validatePlanInput,
  validateToggle,
  verifyPlan,
} from '../../plugins/planner-core.js';

const valid = { title: '  Ship planner  ', tasks: ['- [ ] api', '* ui', '', 'docs'], start: '2025-11-03', end: '2025-11-09' };

describe('normalizeTasks', () => {
  test('strips markdown prefixes and blank lines', () => {
    expect(normalizeTasks('- [ ] one\n- two\n* three\n\n  - [x] four  \nfive')).toEqual(['one', 'two', 'three', 'four', 'five']);
    expect(normalizeTasks(['- a', '  ', 'b'])).toEqual(['a', 'b']);
  });
  test('keeps inner dashes and rejects non-strings', () => {
    expect(normalizeTasks(['re-run - eval'])).toEqual(['re-run - eval']);
    expect(normalizeTasks([1])).toBeNull();
    expect(normalizeTasks(42)).toBeNull();
  });
});

describe('validatePlanInput', () => {
  test('cleans a valid plan', () => {
    const r = validatePlanInput(valid);
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ title: 'Ship planner', notes: '', tag: '', tasks: ['api', 'ui', 'docs'], start: '2025-11-03', end: '2025-11-09' });
  });
  const bad = (patch) => validatePlanInput({ ...valid, ...patch }).errors;
  test('title', () => {
    expect(bad({ title: '   ' }).title).toBeTruthy();
    expect(bad({ title: 'x'.repeat(121) }).title).toMatch(/max 120/);
    expect(validatePlanInput({ ...valid, title: 'x'.repeat(120) }).ok).toBe(true);
  });
  test('dates', () => {
    expect(bad({ start: '2025-02-30' }).start).toBeTruthy();
    expect(bad({ end: 'soon' }).end).toBeTruthy();
    expect(bad({ start: '2025-11-10', end: '2025-11-09' }).end).toMatch(/before start/);
    expect(bad({ start: '2024-01-01', end: '2025-01-01' }).end).toMatch(/max 366/);
    expect(validatePlanInput({ ...valid, start: '2024-01-01', end: '2024-12-31' }).ok).toBe(true);
  });
  test('tasks', () => {
    expect(bad({ tasks: [] }).tasks).toMatch(/at least one/);
    expect(bad({ tasks: ['- [ ] ', ' '] }).tasks).toMatch(/at least one/);
    expect(bad({ tasks: Array(51).fill('t') }).tasks).toMatch(/max 50/);
    expect(bad({ tasks: ['ok', 'y'.repeat(201)] }).tasks).toMatch(/task 2/);
    expect(bad({ tasks: [{ text: 'x' }] }).tasks).toBeTruthy();
  });
  test('notes and tag', () => {
    expect(bad({ notes: 'n'.repeat(2001) }).notes).toBeTruthy();
    expect(bad({ notes: 5 }).notes).toBeTruthy();
    expect(bad({ tag: 'Work' }).tag).toMatch(/a-z/);
    expect(bad({ tag: 'a'.repeat(25) }).tag).toBeTruthy();
    expect(validatePlanInput({ ...valid, tag: 'ml-ops', notes: null }).value.tag).toBe('ml-ops');
  });
  test('non-object body', () => {
    expect(validatePlanInput(null).ok).toBe(false);
    expect(validatePlanInput([]).ok).toBe(false);
  });
});

describe('canonical + hash', () => {
  test('canonical sorts keys at every level', () => {
    expect(canonical({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: 'x' } })).toBe('{"a":{"c":"x","d":[1,{"y":2,"z":1}]},"b":1}');
  });
  test('hash is sha256 of the canonical seal fields and is order independent', async () => {
    const plan = { start: '2025-11-03', title: 'T', end: '2025-11-04', tasks: ['a'], notes: '', tag: '', sealedAt: '2025-11-01T10:00:00.000Z' };
    const expected = createHash('sha256').update(canonical({ ...plan })).digest('hex');
    expect(await hashPlan(plan)).toBe(expected);
    expect(await hashPlan({ ...plan, tasks: [{ text: 'a', done: true, doneAt: 'x' }] })).toBe(expected);
  });
  test('sealPlan derives id from hash and verifies', async () => {
    const { value } = validatePlanInput(valid);
    const plan = await sealPlan(value, '2025-11-01T10:00:00.000Z');
    expect(plan.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(plan.id).toBe(plan.hash.slice(0, 10));
    expect(plan.tasks).toEqual([
      { text: 'api', done: false, doneAt: null },
      { text: 'ui', done: false, doneAt: null },
      { text: 'docs', done: false, doneAt: null },
    ]);
    expect(await verifyPlan(plan)).toBe(true);
    expect(await verifyPlan(toggleTask(plan, 0, true))).toBe(true); // done-state is not sealed
    expect(await verifyPlan({ ...plan, title: 'edited' })).toBe(false);
  });
});

describe('toggle', () => {
  const plan = { id: 'x', tasks: [{ text: 'a', done: false, doneAt: null }, { text: 'b', done: true, doneAt: 'T0' }] };
  test('validateToggle', () => {
    expect(validateToggle({ task: 0, done: true }, plan)).toBeNull();
    expect(validateToggle({ task: 2, done: true }, plan)).toMatch(/index/);
    expect(validateToggle({ task: 0.5, done: true }, plan)).toMatch(/index/);
    expect(validateToggle({ task: 0, done: 'yes' }, plan)).toMatch(/done/);
    expect(validateToggle({ task: 0, done: true, title: 'x' }, plan)).toMatch(/immutable/);
  });
  test('toggleTask sets and keeps doneAt', () => {
    expect(toggleTask(plan, 0, true, 'T1').tasks[0]).toEqual({ text: 'a', done: true, doneAt: 'T1' });
    expect(toggleTask(plan, 1, true, 'T1').tasks[1].doneAt).toBe('T0');
    expect(toggleTask(plan, 1, false, 'T1').tasks[1]).toEqual({ text: 'b', done: false, doneAt: null });
    expect(plan.tasks[0].done).toBe(false); // input untouched
  });
});

describe('store helpers', () => {
  test('sortPlans by start, then sealedAt', () => {
    const plans = [
      { id: 'c', start: '2025-11-05', sealedAt: '2025-01-01' },
      { id: 'b', start: '2025-11-03', sealedAt: '2025-01-02' },
      { id: 'a', start: '2025-11-03', sealedAt: '2025-01-01' },
    ];
    expect(sortPlans(plans).map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(plans[0].id).toBe('c');
  });
  test('serializeStore is pretty, sorted, newline-terminated', () => {
    const text = serializeStore([]);
    expect(text).toBe('{\n  "version": 1,\n  "plans": []\n}\n');
  });
  test('assertStore rejects bad shapes', () => {
    expect(() => assertStore({ version: 1, plans: [] })).not.toThrow();
    expect(() => assertStore([])).toThrow();
    expect(() => assertStore({ version: 2, plans: [] })).toThrow(/version/);
    expect(() => assertStore({ version: 1, plans: {} })).toThrow(/array/);
    expect(() => assertStore({ version: 1, plans: [{ id: 'x' }] })).toThrow(/plans\[0\]/);
  });
});
