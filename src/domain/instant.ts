/**
 * Instants — the one way Simple Budget stores and reads points in time.
 *
 * Golden rule: every moment is a **UTC ISO-8601 timestamp** (`YYYY-MM-DDTHH:mm:ss.sssZ`).
 * It is converted to the device's local calendar only to display it or to decide which
 * month/day it belongs to. `IsoDate` / `MonthKey` strings stay as derived, indexable values.
 */
import { todayIn, type IsoDate } from './calendar';

export type UtcTimestamp = string;
/** Local wall-clock time of day, 24-hour `HH:mm`. */
export type LocalTime = string;

const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const LOCAL_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isUtcTimestamp(value: string): boolean {
  return UTC_TIMESTAMP_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}

export function assertUtcTimestamp(value: string): UtcTimestamp {
  if (!isUtcTimestamp(value)) {
    throw new RangeError(
      `Expected UTC timestamp like 2026-11-05T17:30:00.000Z, received "${value}"`,
    );
  }
  return value;
}

export function isLocalTime(value: string): boolean {
  return LOCAL_TIME_PATTERN.test(value);
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** The local calendar day an instant falls on. */
export function localDateOf(instant: UtcTimestamp): IsoDate {
  return todayIn(new Date(assertUtcTimestamp(instant)));
}

/** The local time of day (`HH:mm`) of an instant. */
export function localTimeOf(instant: UtcTimestamp): LocalTime {
  const moment = new Date(assertUtcTimestamp(instant));
  return `${pad2(moment.getHours())}:${pad2(moment.getMinutes())}`;
}

/** Converts a local calendar day + local time into the UTC instant it represents. */
export function instantFromLocal(date: IsoDate, time: LocalTime = '00:00'): UtcTimestamp {
  if (!isLocalTime(time)) {
    throw new RangeError(`Expected local time like 17:30, received "${time}"`);
  }
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const hours = Number(time.slice(0, 2));
  const minutes = Number(time.slice(3, 5));
  return new Date(year, month - 1, day, hours, minutes, 0, 0).toISOString();
}

/** Formats an instant's local time of day for people, e.g. "3:42 PM". */
export function formatLocalTime(instant: UtcTimestamp, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(
    new Date(assertUtcTimestamp(instant)),
  );
}
