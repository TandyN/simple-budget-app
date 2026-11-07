import {
  firstDayOf,
  previousMonthName,
  compareMonths,
  type IsoDate,
  type MonthKey,
} from './calendar';
import { instantFromLocal, type UtcTimestamp } from './instant';
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
  /** UTC instant the transaction happened (source of truth for ordering and time display). */
  readonly occurredAt: UtcTimestamp;
  /** Local calendar day of `occurredAt`; derived and stored only so it can be indexed. */
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
  /** Every transaction this month (recurring, manual, adjustment), newest first. */
  readonly activity: readonly LedgerEntry[];
  readonly lines: readonly StatementLine[];
  readonly totalIn: Cents;
  readonly totalOut: Cents;
  readonly currentBudget: Cents;
}

/** When a transaction happened, tolerating legacy rows saved before `occurredAt` existed. */
export function entryInstant(entry: LedgerEntry): UtcTimestamp {
  return (entry as Partial<LedgerEntry>).occurredAt ?? entry.createdAt;
}

function compareNewestFirst(left: LedgerEntry, right: LedgerEntry): number {
  const leftInstant = entryInstant(left);
  const rightInstant = entryInstant(right);
  if (leftInstant !== rightInstant) {
    return rightInstant.localeCompare(leftInstant);
  }
  if (left.source === 'recurring' && right.source === 'recurring') {
    // Recurring lines posted together read like the budget plan: income first, then by name.
    return compareRecurringOrder(
      { kind: left.amount >= 0 ? 'income' : 'expense', name: left.name, id: left.id },
      { kind: right.amount >= 0 ? 'income' : 'expense', name: right.name, id: right.id },
    );
  }
  if (left.createdAt !== right.createdAt) {
    return right.createdAt.localeCompare(left.createdAt);
  }
  return right.id.localeCompare(left.id);
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
    occurredAt: instantFromLocal(firstDay, '00:00'),
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

  const activity = [...entriesIn].sort(compareNewestFirst);

  const otherLines = entriesIn
    .filter((entry) => entry.source !== 'recurring')
    .sort(compareNewestFirst);

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
    ...otherLines.map(
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
    activity,
    lines,
    totalIn,
    totalOut,
    currentBudget,
  };
}
