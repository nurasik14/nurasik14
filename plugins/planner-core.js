// Pure planner logic shared by the API (plugins/planner-api.js), the client
// (src/planner/) and the tests (tests/planner/). No Node or DOM APIs: hashing
// uses Web Crypto, which exists in Node 20+, Bun and secure browser contexts.
import { isDate, compareDates, rangeLength } from '../src/planner/dates.js';

export const LIMITS = {
  title: 120,
  notes: 2000,
  tag: 24,
  tasks: 50,
  task: 200,
  rangeDays: 366,
};

const TAG_RE = /^[a-z0-9-]+$/;
// "- [ ] task", "- [x] task", "- task", "* task" -> "task"
const TASK_PREFIX_RE = /^(?:[-*](?:\s+|$))?(?:\[[ xX]?\](?:\s+|$))?/;

/** One task per line (or an array of lines) -> trimmed texts, blanks dropped. */
export function normalizeTasks(input) {
  const lines = typeof input === 'string' ? input.split(/\r?\n/) : input;
  if (!Array.isArray(lines)) return null;
  const out = [];
  for (const line of lines) {
    if (typeof line !== 'string') return null;
    const text = line.trim().replace(TASK_PREFIX_RE, '').trim();
    if (text) out.push(text);
  }
  return out;
}

const optionalString = (v) => (v == null ? '' : v);

/**
 * Validate a seal request. Returns { ok: true, value } with the cleaned plan
 * fields, or { ok: false, errors } keyed by field name, in form order.
 */
export function validatePlanInput(body) {
  const errors = {};
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, errors: { body: 'expected a JSON object' } };
  }

  const title = typeof body.title === 'string' ? body.title.trim() : null;
  if (!title) errors.title = 'title is required';
  else if (title.length > LIMITS.title) errors.title = `title is ${title.length} chars; max ${LIMITS.title}`;

  const { start, end } = body;
  if (!isDate(start)) errors.start = 'start must be a real date (YYYY-MM-DD)';
  if (!isDate(end)) errors.end = 'end must be a real date (YYYY-MM-DD)';
  if (!errors.start && !errors.end) {
    if (compareDates(start, end) > 0) errors.end = 'end is before start';
    else if (rangeLength(start, end) > LIMITS.rangeDays) errors.end = `range is ${rangeLength(start, end)} days; max ${LIMITS.rangeDays}`;
  }

  const tasks = normalizeTasks(body.tasks);
  if (tasks == null) errors.tasks = 'tasks must be a list of strings';
  else if (tasks.length === 0) errors.tasks = 'add at least one task';
  else if (tasks.length > LIMITS.tasks) errors.tasks = `${tasks.length} tasks; max ${LIMITS.tasks}`;
  else {
    const long = tasks.findIndex((t) => t.length > LIMITS.task);
    if (long !== -1) errors.tasks = `task ${long + 1} is ${tasks[long].length} chars; max ${LIMITS.task}`;
  }

  const notesRaw = optionalString(body.notes);
  const notes = typeof notesRaw === 'string' ? notesRaw.trim() : null;
  if (notes == null) errors.notes = 'notes must be text';
  else if (notes.length > LIMITS.notes) errors.notes = `notes are ${notes.length} chars; max ${LIMITS.notes}`;

  const tagRaw = optionalString(body.tag);
  const tag = typeof tagRaw === 'string' ? tagRaw.trim() : null;
  if (tag == null) errors.tag = 'tag must be text';
  else if (tag.length > LIMITS.tag) errors.tag = `tag is ${tag.length} chars; max ${LIMITS.tag}`;
  else if (tag && !TAG_RE.test(tag)) errors.tag = 'tag allows only a-z, 0-9 and -';

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { title, notes, tag, tasks, start, end } };
}

/** JSON with object keys sorted at every level, no whitespace. */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** The exact fields the seal covers. Task done-state is deliberately excluded. */
export function sealFields(plan) {
  return {
    title: plan.title,
    notes: plan.notes ?? '',
    tag: plan.tag ?? '',
    tasks: plan.tasks.map((t) => (typeof t === 'string' ? t : t.text)),
    start: plan.start,
    end: plan.end,
    sealedAt: plan.sealedAt,
  };
}

/** sha256 hex of the canonical seal fields. */
export async function hashPlan(plan) {
  const bytes = new TextEncoder().encode(canonical(sealFields(plan)));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** True when the stored hash still matches the sealed content. */
export async function verifyPlan(plan) {
  return typeof plan?.hash === 'string' && (await hashPlan(plan)) === plan.hash;
}

/** Build a sealed plan from validated fields. */
export async function sealPlan(value, sealedAt = new Date().toISOString()) {
  const base = { ...value, sealedAt };
  const hash = await hashPlan(base);
  return {
    id: hash.slice(0, 10),
    hash,
    title: value.title,
    notes: value.notes,
    tag: value.tag,
    start: value.start,
    end: value.end,
    sealedAt,
    tasks: value.tasks.map((text) => ({ text, done: false, doneAt: null })),
  };
}

/** Validate a PATCH body against a plan: { task: index, done: boolean }. */
export function validateToggle(body, plan) {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) return 'expected a JSON object';
  const keys = Object.keys(body);
  const extra = keys.filter((k) => k !== 'task' && k !== 'done');
  if (extra.length) return `sealed plans are immutable; only task done-state can change (got ${extra.join(', ')})`;
  if (!Number.isInteger(body.task) || body.task < 0 || body.task >= plan.tasks.length) {
    return `task must be an index from 0 to ${plan.tasks.length - 1}`;
  }
  if (typeof body.done !== 'boolean') return 'done must be true or false';
  return null;
}

/** Return a copy of `plan` with one task's done-state set. Keeps doneAt if already done. */
export function toggleTask(plan, index, done, now = new Date().toISOString()) {
  const tasks = plan.tasks.map((t, i) => {
    if (i !== index) return t;
    if (done) return { ...t, done: true, doneAt: t.done && t.doneAt ? t.doneAt : now };
    return { ...t, done: false, doneAt: null };
  });
  return { ...plan, tasks };
}

/** Plans ordered by start date, then seal time, then id. Returns a new array. */
export function sortPlans(plans) {
  return [...plans].sort(
    (a, b) => compareDates(a.start, b.start) || compareDates(a.sealedAt, b.sealedAt) || compareDates(a.id, b.id),
  );
}

/** Throws with a readable message unless `data` looks like a plans file. */
export function assertStore(data) {
  if (data == null || typeof data !== 'object' || Array.isArray(data)) throw new Error('expected a JSON object');
  if (data.version !== 1) throw new Error(`unsupported version ${JSON.stringify(data.version)} (expected 1)`);
  if (!Array.isArray(data.plans)) throw new Error('"plans" must be an array');
  data.plans.forEach((p, i) => {
    if (!p || typeof p.id !== 'string' || !Array.isArray(p.tasks) || !isDate(p.start) || !isDate(p.end)) {
      throw new Error(`plans[${i}] is not a valid plan`);
    }
  });
  return data;
}

/** The on-disk text: 2-space JSON, plans sorted, trailing newline. */
export function serializeStore(plans) {
  return `${JSON.stringify({ version: 1, plans: sortPlans(plans) }, null, 2)}\n`;
}

/** Done count for a plan. */
export const doneCount = (plan) => plan.tasks.reduce((n, t) => n + (t.done ? 1 : 0), 0);
