import { describe, expect, test } from 'bun:test';
import {
  addDays,
  addMonths,
  addMonthsToDate,
  compareDates,
  daysInMonth,
  isoWeek,
  longDate,
  monthGrid,
  parseDate,
  rangeLabel,
  rangeLength,
  today,
  weekdayIndex,
} from '../../src/planner/dates.js';

describe('parseDate', () => {
  test('accepts real dates', () => {
    expect(parseDate('2025-11-03')).toEqual({ y: 2025, m: 11, d: 3 });
    expect(parseDate('2024-02-29')).toEqual({ y: 2024, m: 2, d: 29 });
  });
  test('rejects impossible or malformed dates', () => {
    for (const bad of ['2025-02-29', '2025-13-01', '2025-00-10', '2025-04-31', '2025-1-1', '25-01-01', '', null, 20250101, '2025-01-01T00:00']) {
      expect(parseDate(bad)).toBeNull();
    }
  });
});

describe('arithmetic', () => {
  test('addDays crosses months, years and DST without drift', () => {
    expect(addDays('2025-01-31', 1)).toBe('2025-02-01');
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    // EU and US DST switches
    expect(addDays('2025-03-29', 2)).toBe('2025-03-31');
    expect(addDays('2025-10-25', 2)).toBe('2025-10-27');
    expect(addDays('2025-11-01', 2)).toBe('2025-11-03');
  });
  test('compare and range length', () => {
    expect(compareDates('2025-01-02', '2025-01-10')).toBeLessThan(0);
    expect(compareDates('2025-01-10', '2025-01-10')).toBe(0);
    expect(rangeLength('2025-11-03', '2025-11-03')).toBe(1);
    expect(rangeLength('2025-11-03', '2025-11-09')).toBe(7);
    expect(rangeLength('2024-01-01', '2024-12-31')).toBe(366);
  });
  test('daysInMonth', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(2025, 12)).toBe(31);
  });
  test('months', () => {
    expect(addMonths('2025-12', 1)).toBe('2026-01');
    expect(addMonths('2025-01', -1)).toBe('2024-12');
    expect(addMonths('2025-06', -18)).toBe('2023-12');
    expect(addMonthsToDate('2025-01-31', 1)).toBe('2025-02-28');
    expect(addMonthsToDate('2024-03-31', -1)).toBe('2024-02-29');
  });
});

describe('weeks', () => {
  test('weekdayIndex is Monday-first', () => {
    expect(weekdayIndex('2025-11-03')).toBe(0); // Monday
    expect(weekdayIndex('2025-11-09')).toBe(6); // Sunday
    expect(weekdayIndex('1970-01-01')).toBe(3); // Thursday
    expect(weekdayIndex('1969-12-29')).toBe(0); // before the epoch
  });
  test('isoWeek matches ISO-8601 edge cases', () => {
    expect(isoWeek('2025-11-03')).toBe(45);
    expect(isoWeek('2021-01-03')).toBe(53); // belongs to 2020-W53
    expect(isoWeek('2021-01-04')).toBe(1);
    expect(isoWeek('2024-12-30')).toBe(1); // belongs to 2025-W01
    expect(isoWeek('2026-12-31')).toBe(53);
    expect(isoWeek('2027-01-01')).toBe(53);
  });
  test('monthGrid covers the month, Monday-first', () => {
    const grid = monthGrid('2025-11');
    expect(grid[0].days[0]).toBe('2025-10-27');
    expect(grid[0].week).toBe(44);
    expect(grid.at(-1).days[6]).toBe('2025-11-30');
    expect(grid).toHaveLength(5);
    for (const w of grid) expect(w.days).toHaveLength(7);
    // February 2021 starts on a Monday and fits exactly 4 rows
    expect(monthGrid('2021-02')).toHaveLength(4);
    // June 2026 needs 5, March 2026 needs 6
    expect(monthGrid('2026-03')).toHaveLength(6);
  });
});

describe('formatting', () => {
  test('today uses local fields', () => {
    expect(today(new Date(2025, 10, 3, 23, 59))).toBe('2025-11-03');
    expect(today(new Date(2025, 10, 3, 0, 1))).toBe('2025-11-03');
  });
  test('labels', () => {
    expect(longDate('2025-11-03')).toBe('Monday, 3 November 2025');
    expect(rangeLabel('2025-11-03', '2025-11-09', 2025)).toBe('Nov 3 → Nov 9');
    expect(rangeLabel('2025-12-29', '2026-01-04', 2025)).toBe('Dec 29 2025 → Jan 4 2026');
    expect(rangeLabel('2025-11-03', '2025-11-03', 2025)).toBe('Nov 3');
    expect(rangeLabel('2027-11-03', '2027-11-04', 2025)).toBe('Nov 3 2027 → Nov 4 2027');
  });
});
