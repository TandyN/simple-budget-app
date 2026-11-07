import { addMonths, firstDayOf, monthKeyOf, type IsoDate, type MonthKey } from './calendar';
import {
  monthStatement,
  recurrenceKeyFor,
  type LedgerEntry,
  type MonthStatement,
  type RecurringItem,
} from './ledger';
import { negate, parseMoneyInput, ZERO_CENTS, type Cents } from './money';

let builderIdCounter = 0;

function nextBuilderId(prefix: string): string {
  builderIdCounter += 1;
  return `${prefix}-${String(builderIdCounter)}`;
}

export function money(formatted: string): Cents {
  const trimmed = formatted.trim();
  const isNegative = trimmed.startsWith('−') || trimmed.startsWith('-');
  const unsigned = isNegative || trimmed.startsWith('+') ? trimmed.slice(1).trim() : trimmed;
  const parsed = parseMoneyInput(unsigned);
  if (!parsed.ok) {
    throw new Error(`Invalid test money string "${formatted}": ${parsed.reason}`);
  }
  return isNegative ? negate(parsed.cents) : parsed.cents;
}

export interface RecurringIncomeBuilderOptions {
  readonly id?: string;
  readonly name?: string;
  readonly amount: string;
  readonly startMonth?: MonthKey;
  readonly endMonth?: MonthKey | null;
  readonly tagIds?: readonly string[];
  readonly createdAt?: string;
}

export function aRecurringIncome(options: RecurringIncomeBuilderOptions): RecurringItem {
  const createdAt = options.createdAt ?? '2026-11-01T00:00:00.000Z';
  return {
    id: options.id ?? 'recurring-income',
    kind: 'income',
    name: options.name ?? 'Monthly income',
    amount: money(options.amount),
    tagIds: [...(options.tagIds ?? [])],
    startMonth: options.startMonth ?? '2026-11',
    endMonth: options.endMonth ?? null,
    createdAt,
    updatedAt: createdAt,
  };
}

export interface RecurringExpenseBuilderOptions {
  readonly id?: string;
  readonly name: string;
  readonly amount: string;
  readonly startMonth?: MonthKey;
  readonly endMonth?: MonthKey | null;
  readonly tagIds?: readonly string[];
  readonly createdAt?: string;
}

export function aRecurringExpense(options: RecurringExpenseBuilderOptions): RecurringItem {
  const slug = options.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const createdAt = options.createdAt ?? '2026-11-01T00:00:00.000Z';
  return {
    id: options.id ?? `recurring-${slug}`,
    kind: 'expense',
    name: options.name,
    amount: money(options.amount),
    tagIds: [...(options.tagIds ?? [])],
    startMonth: options.startMonth ?? '2026-11',
    endMonth: options.endMonth ?? null,
    createdAt,
    updatedAt: createdAt,
  };
}

export interface StatementDraftLine {
  readonly name: string;
  readonly amount: Cents;
  readonly source: 'recurring' | 'manual' | 'adjustment';
  readonly date?: IsoDate;
  readonly recurringItemId?: string | null;
  readonly tagIds?: readonly string[];
  readonly note?: string;
}

export function monthlyIncome(amount: string, date?: IsoDate): StatementDraftLine {
  return {
    name: 'Monthly income',
    amount: money(amount),
    source: 'recurring',
    date,
    recurringItemId: 'recurring-income',
  };
}

export function recurringExpense(name: string, amount: string, date?: IsoDate): StatementDraftLine {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return {
    name,
    amount: negate(money(amount)),
    source: 'recurring',
    date,
    recurringItemId: `recurring-${slug}`,
  };
}

export interface ManualEntryBuilderOptions {
  readonly id?: string;
  readonly name: string;
  readonly amount: string;
  readonly date?: IsoDate;
  readonly tagIds?: readonly string[];
  readonly note?: string;
  readonly createdAt?: string;
}

export function anExpense(options: ManualEntryBuilderOptions): LedgerEntry {
  const date = options.date ?? '2026-11-05';
  const createdAt = options.createdAt ?? `${date}T12:00:00.000Z`;
  return {
    id: options.id ?? nextBuilderId('expense'),
    date,
    monthKey: monthKeyOf(date),
    amount: negate(money(options.amount)),
    name: options.name,
    note: options.note ?? '',
    tagIds: [...(options.tagIds ?? [])],
    source: 'manual',
    recurringItemId: null,
    createdAt,
    updatedAt: createdAt,
  };
}

export function aDeposit(options: ManualEntryBuilderOptions): LedgerEntry {
  const date = options.date ?? '2026-11-05';
  const createdAt = options.createdAt ?? `${date}T12:00:00.000Z`;
  return {
    id: options.id ?? nextBuilderId('deposit'),
    date,
    monthKey: monthKeyOf(date),
    amount: money(options.amount),
    name: options.name,
    note: options.note ?? '',
    tagIds: [...(options.tagIds ?? [])],
    source: 'manual',
    recurringItemId: null,
    createdAt,
    updatedAt: createdAt,
  };
}

function toLedgerEntryInMonth(
  line: StatementDraftLine | LedgerEntry,
  month: MonthKey,
): LedgerEntry {
  if ('monthKey' in line) {
    return line;
  }
  const date = line.date ?? firstDayOf(month);
  const id = nextBuilderId(line.source);
  const recurringItemId = line.recurringItemId ?? null;
  return {
    id,
    date,
    monthKey: month,
    amount: line.amount,
    name: line.name,
    note: line.note ?? '',
    tagIds: [...(line.tagIds ?? [])],
    source: line.source,
    recurringItemId,
    ...(line.source === 'recurring' && recurringItemId
      ? { recurrenceKey: recurrenceKeyFor(month, recurringItemId) }
      : {}),
    createdAt: `${date}T09:00:00.000Z`,
    updatedAt: `${date}T09:00:00.000Z`,
  };
}

export interface MonthStatementBuilderOptions {
  readonly month: MonthKey;
  readonly carriedOver?: string;
  readonly lines: readonly (StatementDraftLine | LedgerEntry)[];
}

export function aMonthStatement(options: MonthStatementBuilderOptions): MonthStatement {
  const carriedOverCents = options.carriedOver ? money(options.carriedOver) : ZERO_CENTS;
  const previousMonth = addMonths(options.month, -1);
  const entriesBefore: LedgerEntry[] =
    carriedOverCents === ZERO_CENTS
      ? []
      : [
          {
            id: nextBuilderId('prior'),
            date: firstDayOf(previousMonth),
            monthKey: previousMonth,
            amount: carriedOverCents,
            name: 'Prior balance',
            note: '',
            tagIds: [],
            source: 'manual',
            recurringItemId: null,
            createdAt: `${firstDayOf(previousMonth)}T00:00:00.000Z`,
            updatedAt: `${firstDayOf(previousMonth)}T00:00:00.000Z`,
          },
        ];

  const entriesIn = options.lines.map((line) => toLedgerEntryInMonth(line, options.month));
  return monthStatement({
    month: options.month,
    entriesBefore,
    entriesIn,
  });
}

export function openNextMonth(
  previous: MonthStatement,
  nextMonthLines: readonly (StatementDraftLine | LedgerEntry)[] = [],
): MonthStatement {
  const nextMonth = addMonths(previous.month, 1);
  const entriesBefore: LedgerEntry[] =
    previous.currentBudget === ZERO_CENTS
      ? []
      : [
          {
            id: nextBuilderId('carry'),
            date: firstDayOf(previous.month),
            monthKey: previous.month,
            amount: previous.currentBudget,
            name: 'Prior month net',
            note: '',
            tagIds: [],
            source: 'manual',
            recurringItemId: null,
            createdAt: `${firstDayOf(previous.month)}T00:00:00.000Z`,
            updatedAt: `${firstDayOf(previous.month)}T00:00:00.000Z`,
          },
        ];

  const entriesIn = nextMonthLines.map((line) => toLedgerEntryInMonth(line, nextMonth));
  return monthStatement({
    month: nextMonth,
    entriesBefore,
    entriesIn,
  });
}
