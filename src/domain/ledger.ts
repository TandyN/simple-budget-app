import {
  firstDayOf,
  previousMonthName,
  compareMonths,
  type IsoDate,
  type MonthKey,
} from './calendar';
import { addCents, negate, sumCents, type Cents } from './money';

export interface RecurringItem {
  readonly id: string;
  readonly kind: 'income' | 'expense';
  readonly name: string;
  readonly amount: Cents;
  readonly tagIds: readonly string[];
  readonly startMonth: MonthKey;
  readonly endMonth: MonthKey | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AdjustmentInfo {
  readonly change: 'amount-changed' | 'added' | 'removed';
  readonly from: Cents | null;
  readonly to: Cents | null;
}

export interface LedgerEntry {
  readonly id: string;
  readonly date: IsoDate;
  readonly monthKey: MonthKey;
  readonly amount: Cents;
  readonly name: string;
  readonly note: string;
  readonly tagIds: readonly string[];
  readonly source: 'manual' | 'recurring' | 'adjustment';
  readonly recurringItemId: string | null;
  readonly recurrenceKey?: string;
  readonly adjustment?: AdjustmentInfo;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface OpenedMonth {
  readonly monthKey: MonthKey;
  readonly openedAt: string;
}

export interface StatementLine {
  readonly kind: 'carried-over' | 'recurring' | 'manual' | 'adjustment';
  readonly name: string;
  readonly amount: Cents;
  readonly entry?: LedgerEntry;
}

export interface MonthStatement {
  readonly month: MonthKey;
  readonly carriedOver: Cents;
  readonly carriedOverLabel: string;
  readonly startingPoint: readonly LedgerEntry[];
  readonly activity: readonly LedgerEntry[];
  readonly lines: readonly StatementLine[];
  readonly totalIn: Cents;
  readonly totalOut: Cents;
  readonly currentBudget: Cents;
}

export function isActiveIn(item: RecurringItem, month: MonthKey): boolean {
  const started = compareMonths(item.startMonth, month) <= 0;
  const notEnded = item.endMonth === null || compareMonths(month, item.endMonth) <= 0;
  return started && notEnded;
}

export function signedAmount(item: Pick<RecurringItem, 'kind' | 'amount'>): Cents {
  return item.kind === 'income' ? item.amount : negate(item.amount);
}

export function recurrenceKeyFor(month: MonthKey, recurringItemId: string): string {
  return `${month}:${recurringItemId}`;
}

function compareRecurringOrder(
  left: { readonly kind: 'income' | 'expense'; readonly name: string; readonly id: string },
  right: { readonly kind: 'income' | 'expense'; readonly name: string; readonly id: string },
): number {
  if (left.kind !== right.kind) {
    return left.kind === 'income' ? -1 : 1;
  }
  const byName = left.name.localeCompare(right.name);
  if (byName !== 0) {
    return byName;
  }
  return left.id.localeCompare(right.id);
}

export interface RecurringEntriesToOpenParams {
  readonly items: readonly RecurringItem[];
  readonly month: MonthKey;
  readonly existingRecurrenceKeys: ReadonlySet<string>;
  readonly nextId: () => string;
  readonly now: string;
}

export function recurringEntriesToOpen(params: RecurringEntriesToOpenParams): LedgerEntry[] {
  const { items, month, existingRecurrenceKeys, nextId, now } = params;
  const firstDay = firstDayOf(month);

  const activeNewItems = items
    .filter(
      (item) =>
        isActiveIn(item, month) && !existingRecurrenceKeys.has(recurrenceKeyFor(month, item.id)),
    )
    .sort(compareRecurringOrder);

  return activeNewItems.map((item) => ({
    id: nextId(),
    date: firstDay,
    monthKey: month,
    amount: signedAmount(item),
    name: item.name,
    note: '',
    tagIds: [...item.tagIds],
    source: 'recurring',
    recurringItemId: item.id,
    recurrenceKey: recurrenceKeyFor(month, item.id),
    createdAt: now,
    updatedAt: now,
  }));
}

export function purchasePower(items: readonly RecurringItem[], month: MonthKey): Cents {
  const activeSignedAmounts = items
    .filter((item) => isActiveIn(item, month))
    .map((item) => signedAmount(item));
  return sumCents(activeSignedAmounts);
}

export interface MonthStatementParams {
  readonly month: MonthKey;
  readonly entriesBefore: readonly LedgerEntry[];
  readonly entriesIn: readonly LedgerEntry[];
}

export function monthStatement(params: MonthStatementParams): MonthStatement {
  const { month, entriesBefore, entriesIn } = params;
  const carriedOver = sumCents(entriesBefore.map((entry) => entry.amount));
  const carriedOverLabel = `Carried over from ${previousMonthName(month)}`;

  const startingPoint = entriesIn
    .filter((entry) => entry.source === 'recurring')
    .sort((left, right) => {
      const leftKind = left.amount >= 0 ? 'income' : 'expense';
      const rightKind = right.amount >= 0 ? 'income' : 'expense';
      return compareRecurringOrder(
        { kind: leftKind, name: left.name, id: left.id },
        { kind: rightKind, name: right.name, id: right.id },
      );
    });

  const activity = entriesIn
    .filter((entry) => entry.source !== 'recurring')
    .sort((left, right) => {
      if (left.date !== right.date) {
        return right.date.localeCompare(left.date);
      }
      if (left.createdAt !== right.createdAt) {
        return right.createdAt.localeCompare(left.createdAt);
      }
      return right.id.localeCompare(left.id);
    });

  const totalIn = sumCents(
    entriesIn.filter((entry) => entry.amount > 0).map((entry) => entry.amount),
  );
  const totalOut = sumCents(
    entriesIn.filter((entry) => entry.amount < 0).map((entry) => entry.amount),
  );
  const monthNet = sumCents(entriesIn.map((entry) => entry.amount));
  const currentBudget = addCents(carriedOver, monthNet);

  const lines: StatementLine[] = [
    { kind: 'carried-over', name: carriedOverLabel, amount: carriedOver },
    ...startingPoint.map(
      (entry): StatementLine => ({
        kind: 'recurring',
        name: entry.name,
        amount: entry.amount,
        entry,
      }),
    ),
    ...activity.map(
      (entry): StatementLine => ({
        kind: entry.source === 'adjustment' ? 'adjustment' : 'manual',
        name: entry.name,
        amount: entry.amount,
        entry,
      }),
    ),
  ];

  return {
    month,
    carriedOver,
    carriedOverLabel,
    startingPoint,
    activity,
    lines,
    totalIn,
    totalOut,
    currentBudget,
  };
}
