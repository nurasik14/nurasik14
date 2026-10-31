import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import Calendar from '../../src/planner/Calendar.jsx';
import { connectMessage, eventLabel, eventsOn, syncSummary, timeOf } from '../../src/planner/google.js';

const lecture = {
  id: 'a1b2c3d4e5f6',
  title: 'CS1102 lecture',
  calendar: 'Lectures',
  color: 0,
  allDay: false,
  start: '2026-11-02T10:00:00+08:00',
  end: '2026-11-02T11:50:00+08:00',
  days: ['2026-11-02'],
};
const night = { ...lecture, id: 'b1', title: 'Night train', start: '2026-11-06T23:00:00+08:00', end: '2026-11-07T06:00:00+08:00', days: ['2026-11-06', '2026-11-07'] };
const week = { id: 'c1', title: 'Reading week', calendar: 'primary', color: 1, allDay: true, start: '2026-11-16', end: '2026-11-20' };
const google = { pulledAt: '2026-10-31T15:00:00.000Z', events: [lecture, night, week] };

const render = (props) =>
  renderToStaticMarkup(
    <Calendar
      month="2026-11"
      onMonth={() => {}}
      plans={[]}
      today="2026-11-02"
      editable={false}
      range={{ start: '', end: '' }}
      onRange={() => {}}
      selectedId={null}
      onSelectPlan={() => {}}
      {...props}
    />,
  );

describe('google overlay helpers', () => {
  test('eventsOn, labels and times', () => {
    expect(eventsOn(google.events, '2026-11-07').map((e) => e.title)).toEqual(['Night train']);
    expect(eventsOn(google.events, '2026-11-18').map((e) => e.title)).toEqual(['Reading week']);
    expect(eventLabel(lecture, '2026-11-02')).toBe('Google: CS1102 lecture 10:00');
    expect(eventLabel(night, '2026-11-07')).toBe('Google: Night train continued');
    expect(eventLabel(week, '2026-11-18')).toBe('Google: Reading week, all day');
    expect(timeOf('2026-11-06T23:00:00+08:00')).toBe('23:00');
  });

  test('statusline texts', () => {
    expect(syncSummary({ pulled: { events: 37 }, pushed: { created: 2, updated: 1, restored: 0, deleted: 0 } })).toBe('synced · pulled 37 · pushed +2 ~1 −0');
    expect(connectMessage('connected')[1]).toBe('ok');
    expect(connectMessage('error', 'access_denied')[0]).toMatch(/test user/);
    expect(connectMessage('error', '<script>')[0]).toBe('google: connect failed (unknown)');
  });
});

describe('calendar with google events', () => {
  test('cells, legend, toggle and day list include google events', () => {
    const html = render({ google, googleOn: true });
    expect(html).toContain('aria-label="Monday, 2 November 2026 — today — Google: CS1102 lecture 10:00"');
    expect(html).toContain('Google: Reading week, all day');
    expect(html).toContain('sealed plan');
    expect(html).toContain('google event');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toMatch(/google events: <span[^>]*>on</);
    expect(html).toContain('border-dashed');
    // The day list for today names the event with its time range and calendar.
    expect(html).toContain('10:00–11:50');
    expect(html).toContain(' · Lectures');
  });

  test('off hides the overlay but keeps the toggle', () => {
    const html = render({ google, googleOn: false });
    expect(html).not.toContain('Google: CS1102');
    expect(html).not.toContain('Reading week');
    expect(html).toMatch(/google events: <span[^>]*>off</);
  });

  test('never pulled: no legend, no overlay', () => {
    const html = render({ google: null });
    expect(html).not.toContain('google event');
    expect(html).not.toContain('border-dashed');
  });
});
