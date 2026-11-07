export type IsoDate = string;
export type MonthKey = string;
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type WeekStartsOn = 0 | 1;
type MonthNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

const MONTH_NAMES: Record<MonthNumber, string> = {
  1: 'January',
  2: 'February',
  3: 'March',
  4: 'April',
  5: 'May',
  6: 'June',
  7: 'July',
  8: 'August',
  9: 'September',
  10: 'October',
  11: 'November',
  12: 'December',
};

const MONTH_KEY_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const ISO_DATE_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function pad4(n: number): string {
  return String(n).padStart(4, '0');
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function isValidMonthKey(value: string): boolean {
  return MONTH_KEY_PATTERN.test(value);
}

export function assertMonthKey(value: string): MonthKey {
  if (!isValidMonthKey(value)) {
    throw new RangeError(`Expected MonthKey in YYYY-MM format, received "${value}"`);
  }
  return value;
}

function parseMonthParts(month: MonthKey): {
  readonly year: number;
  readonly monthNumber: MonthNumber;
} {
  assertMonthKey(month);
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7)) as MonthNumber;
  return { year, monthNumber };
}

export function daysInMonth(month: MonthKey): number {
  const { year, monthNumber } = parseMonthParts(month);
  if (monthNumber === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  if (monthNumber === 4 || monthNumber === 6 || monthNumber === 9 || monthNumber === 11) {
    return 30;
  }
  return 31;
}

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }
  const month = value.slice(0, 7);
  const day = Number(value.slice(8, 10));
  return day <= daysInMonth(month);
}

export function assertIsoDate(value: string): IsoDate {
  if (!isValidIsoDate(value)) {
    throw new RangeError(`Expected valid IsoDate in YYYY-MM-DD format, received "${value}"`);
  }
  return value;
}

export function todayIn(now: Date): IsoDate {
  const year = now.getFullYear();
  const monthNumber = now.getMonth() + 1;
  const day = now.getDate();
  return `${pad4(year)}-${pad2(monthNumber)}-${pad2(day)}`;
}

export function monthKeyOf(date: IsoDate): MonthKey {
  assertIsoDate(date);
  return date.slice(0, 7);
}

export function firstDayOf(month: MonthKey): IsoDate {
  assertMonthKey(month);
  return `${month}-01`;
}

export function addMonths(month: MonthKey, offset: number): MonthKey {
  const { year, monthNumber } = parseMonthParts(month);
  const totalMonths = year * 12 + (monthNumber - 1) + offset;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonthIndex = ((totalMonths % 12) + 12) % 12;
  return `${pad4(targetYear)}-${pad2(targetMonthIndex + 1)}`;
}

export function compareMonths(left: MonthKey, right: MonthKey): number {
  assertMonthKey(left);
  assertMonthKey(right);
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

export function monthsFromTo(start: MonthKey, end: MonthKey): MonthKey[] {
  if (compareMonths(start, end) > 0) {
    return [];
  }
  const result: MonthKey[] = [];
  let cursor = start;
  while (compareMonths(cursor, end) <= 0) {
    result.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return result;
}

export function weekdayOf(date: IsoDate): Weekday {
  assertIsoDate(date);
  const year = Number(date.slice(0, 4));
  const monthNumber = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return new Date(Date.UTC(year, monthNumber - 1, day)).getUTCDay() as Weekday;
}

export function daysLeftInMonth(date: IsoDate): number {
  assertIsoDate(date);
  const totalDays = daysInMonth(monthKeyOf(date));
  const currentDay = Number(date.slice(8, 10));
  return totalDays - currentDay + 1;
}

export interface CalendarGridCell {
  readonly date: IsoDate;
  readonly dayOfMonth: number;
  readonly inMonth: boolean;
  readonly isToday: boolean;
}

export interface BuildMonthGridOptions {
  readonly weekStartsOn?: WeekStartsOn;
  readonly today?: IsoDate;
}

export function buildMonthGrid(
  month: MonthKey,
  options: BuildMonthGridOptions = {},
): CalendarGridCell[][] {
  assertMonthKey(month);
  const weekStartsOn = options.weekStartsOn ?? 0;
  const today = options.today;

  const firstDay = firstDayOf(month);
  const firstWeekday = weekdayOf(firstDay);
  const leadingCount = (firstWeekday - weekStartsOn + 7) % 7;

  const previousMonth = addMonths(month, -1);
  const previousMonthDays = daysInMonth(previousMonth);
  const currentMonthDays = daysInMonth(month);
  const nextMonth = addMonths(month, 1);

  const cells: CalendarGridCell[] = [];

  for (let i = leadingCount - 1; i >= 0; i -= 1) {
    const dayOfMonth = previousMonthDays - i;
    const date = `${previousMonth}-${pad2(dayOfMonth)}`;
    cells.push({
      date,
      dayOfMonth,
      inMonth: false,
      isToday: date === today,
    });
  }

  for (let dayOfMonth = 1; dayOfMonth <= currentMonthDays; dayOfMonth += 1) {
    const date = `${month}-${pad2(dayOfMonth)}`;
    cells.push({
      date,
      dayOfMonth,
      inMonth: true,
      isToday: date === today,
    });
  }

  const trailingCount = (7 - (cells.length % 7)) % 7;
  for (let dayOfMonth = 1; dayOfMonth <= trailingCount; dayOfMonth += 1) {
    const date = `${nextMonth}-${pad2(dayOfMonth)}`;
    cells.push({
      date,
      dayOfMonth,
      inMonth: false,
      isToday: date === today,
    });
  }

  const weeks: CalendarGridCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

export function monthLabel(month: MonthKey): string {
  const { year, monthNumber } = parseMonthParts(month);
  return `${MONTH_NAMES[monthNumber]} ${String(year)}`;
}

export function previousMonthName(month: MonthKey): string {
  const previous = addMonths(month, -1);
  const { monthNumber } = parseMonthParts(previous);
  return MONTH_NAMES[monthNumber];
}
