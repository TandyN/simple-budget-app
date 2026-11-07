import { describe, expect, test } from 'vitest';
import {
  assertUtcTimestamp,
  formatLocalTime,
  instantFromLocal,
  isLocalTime,
  isUtcTimestamp,
  localDateOf,
  localTimeOf,
} from './instant';

describe('instants are UTC timestamps shown in the device local time', () => {
  test('a local date and time survives a round trip through UTC', () => {
    const instant = instantFromLocal('2026-11-05', '17:30');

    expect(isUtcTimestamp(instant)).toBe(true);
    expect(instant.endsWith('Z')).toBe(true);
    expect(localDateOf(instant)).toBe('2026-11-05');
    expect(localTimeOf(instant)).toBe('17:30');
  });

  test('only full UTC timestamps are accepted', () => {
    expect(isUtcTimestamp('2026-11-05T17:30:00.000Z')).toBe(true);
    expect(isUtcTimestamp('2026-11-05T17:30:00Z')).toBe(true);
    expect(isUtcTimestamp('2026-11-05')).toBe(false);
    expect(isUtcTimestamp('2026-11-05T17:30:00')).toBe(false);
    expect(isUtcTimestamp('2026-11-05T17:30:00+02:00')).toBe(false);
    expect(assertUtcTimestamp('2026-11-05T17:30:00.000Z')).toBe('2026-11-05T17:30:00.000Z');
    expect(() => assertUtcTimestamp('2026-11-05')).toThrow(RangeError);
  });

  test('times of day are 24-hour HH:mm', () => {
    expect(isLocalTime('00:00')).toBe(true);
    expect(isLocalTime('23:59')).toBe(true);
    expect(isLocalTime('24:00')).toBe(false);
    expect(isLocalTime('9:30')).toBe(false);
    expect(() => instantFromLocal('2026-11-05', '25:00')).toThrow(RangeError);
  });

  test('the time shown to people is a friendly local time', () => {
    expect(formatLocalTime(instantFromLocal('2026-11-05', '15:42'), 'en-US')).toMatch(
      /^3:42\s?PM$/,
    );
  });
});
