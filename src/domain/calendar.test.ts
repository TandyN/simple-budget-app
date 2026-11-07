import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import {
  addMonths,
  assertIsoDate,
  assertMonthKey,
  buildMonthGrid,
  compareMonths,
  daysInMonth,
  daysLeftInMonth,
  firstDayOf,
  isValidIsoDate,
  isValidMonthKey,
  monthKeyOf,
  monthLabel,
  monthsFromTo,
  previousMonthName,
  todayIn,
  weekdayOf,
} from './calendar';

describe('local calendar rules', () => {
  test('February 2028 has 29 days because 2028 is a leap year', () => {
    expect(daysInMonth('2028-02')).toBe(29);
  });

  test('February 2100 has 28 days because century years are not leap years', () => {
    expect(daysInMonth('2100-02')).toBe(28);
  });

  test('February 2000 had 29 days because years divisible by 400 are leap years', () => {
    expect(daysInMonth('2000-02')).toBe(29);
  });

  test('30-day and 31-day months return their exact day counts', () => {
    expect(daysInMonth('2026-04')).toBe(30);
    expect(daysInMonth('2026-06')).toBe(30);
    expect(daysInMonth('2026-09')).toBe(30);
    expect(daysInMonth('2026-11')).toBe(30);
    expect(daysInMonth('2026-12')).toBe(31);
  });

  test('the month after December 2026 is January 2027', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
  });

  test('the month before January 2027 is December 2026', () => {
    expect(addMonths('2027-01', -1)).toBe('2026-12');
  });

  test('November 2026 starts on a Sunday', () => {
    const firstDay = firstDayOf('2026-11');

    expect(firstDay).toBe('2026-11-01');
    expect(weekdayOf(firstDay)).toBe(0);
  });

  test('a month grid always contains whole weeks and every day of the month exactly once', () => {
    const grid = buildMonthGrid('2026-10', { today: '2026-10-15' });

    for (const week of grid) {
      expect(week).toHaveLength(7);
    }

    const octoberCells = grid.flat().filter((cell) => cell.inMonth);
    expect(octoberCells).toHaveLength(31);
    expect(octoberCells[0]?.date).toBe('2026-10-01');
    expect(octoberCells[30]?.date).toBe('2026-10-31');
    expect(octoberCells.find((cell) => cell.date === '2026-10-15')?.isToday).toBe(true);
  });

  test('the grid can start weeks on Monday', () => {
    const grid = buildMonthGrid('2026-11', { weekStartsOn: 1 });
    const firstWeek = grid[0];

    expect(firstWeek?.[0]?.date).toBe('2026-10-26');
    expect(firstWeek?.[0]?.inMonth).toBe(false);
    expect(firstWeek?.[6]?.date).toBe('2026-11-01');
    expect(firstWeek?.[6]?.inMonth).toBe(true);
  });

  test('days left in November on the 5th is 26, counting today', () => {
    // 30 − 5 + 1 = 26 days remaining in November
    expect(daysLeftInMonth('2026-11-05')).toBe(26);
  });

  test('month labels and previous month names read naturally', () => {
    expect(monthLabel('2026-11')).toBe('November 2026');
    expect(previousMonthName('2026-11')).toBe('October');
    expect(previousMonthName('2027-01')).toBe('December');
  });

  test('todayIn extracts the local calendar date and monthKeyOf extracts the month', () => {
    const localDate = new Date(2026, 10, 5, 23, 45, 0);
    const today = todayIn(localDate);

    expect(today).toBe('2026-11-05');
    expect(monthKeyOf(today)).toBe('2026-11');
  });

  test('monthsFromTo returns an inclusive range of months or empty when start is after end', () => {
    expect(monthsFromTo('2026-11', '2027-02')).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
    expect(monthsFromTo('2027-02', '2026-11')).toEqual([]);
    expect(compareMonths('2026-11', '2026-11')).toBe(0);
  });

  test('invalid month keys and invalid calendar dates are rejected', () => {
    expect(isValidMonthKey('2026-13')).toBe(false);
    expect(() => assertMonthKey('2026-00')).toThrow(RangeError);
    expect(isValidIsoDate('2026-02-29')).toBe(false);
    expect(isValidIsoDate('not-a-date')).toBe(false);
    expect(() => assertIsoDate('2026-11-31')).toThrow(RangeError);
  });

  test('for any month, adding then subtracting n months returns the same month', () => {
    const monthArbitrary = fc
      .record({
        year: fc.integer({ min: 1970, max: 2200 }),
        month: fc.integer({ min: 1, max: 12 }),
      })
      .map(
        ({ year, month }) => `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`,
      );

    fc.assert(
      fc.property(monthArbitrary, fc.integer({ min: -240, max: 240 }), (month, offset) => {
        const shifted = addMonths(month, offset);
        const restored = addMonths(shifted, -offset);

        expect(restored).toBe(month);
      }),
    );
  });
});
