import {
  assertIsoDate,
  assertMonthKey,
  monthKeyOf,
  monthsFromTo,
  type IsoDate,
  type MonthKey,
  type WeekStartsOn,
} from '../../domain/calendar';
import {
  entryInstant,
  monthStatement,
  recurringEntriesToOpen,
  type LedgerEntry,
  type MonthStatement,
  type RecurringItem,
} from '../../domain/ledger';
import { instantFromLocal, localDateOf, localTimeOf, type LocalTime } from '../../domain/instant';
import { cents, negate, type Cents } from '../../domain/money';
import type { SimpleBudgetDatabase } from '../../data/database';
import {
  addLedgerEntry,
  getEntriesBeforeMonth,
  getEntriesForMonth,
  getLatestOpenedMonth,
  getLedgerEntryById,
  getSettings,
  listOpenedMonths,
  listRecurringItems,
  putLedgerEntry,
  putOpenedMonth,
  putRecurringItem,
  putSettings,
  removeLedgerEntry,
} from '../../data/repositories';
import type { Clock, IdGenerator } from '../providers';

export interface AppDependencies {
  readonly db: SimpleBudgetDatabase;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export interface SetupRecurringExpenseInput {
  readonly name: string;
  readonly amount: Cents;
  readonly tagIds?: readonly string[];
}

export interface CompleteSetupInput {
  readonly monthlyIncome: Cents;
  readonly recurringExpenses: readonly SetupRecurringExpenseInput[];
  readonly weekStartsOn?: WeekStartsOn;
  readonly locale?: string;
}

export type ManualEntryKind = 'expense' | 'deposit';

export interface AddEntryInput {
  readonly kind: ManualEntryKind;
  readonly amount: Cents;
  readonly name?: string;
  /** Local calendar day. Defaults to today. */
  readonly date?: IsoDate;
  /** Local time of day (`HH:mm`). Defaults to the current time (the "override time" toggle sets it). */
  readonly time?: LocalTime;
  readonly note?: string;
  readonly tagIds?: readonly string[];
}

export interface UpdateEntryInput {
  readonly id: string;
  readonly amount?: Cents;
  readonly name?: string;
  readonly date?: IsoDate;
  /** Local time of day (`HH:mm`). Defaults to the entry's existing time of day. */
  readonly time?: LocalTime;
  readonly note?: string;
  readonly tagIds?: readonly string[];
}

export async function completeSetup(
  deps: AppDependencies,
  input: CompleteSetupInput,
): Promise<MonthStatement> {
  const today = deps.clock.today();
  const currentMonth = monthKeyOf(today);
  const now = deps.clock.now();

  if (input.monthlyIncome < 0) {
    throw new RangeError('Monthly income must be zero or positive.');
  }

  return deps.db.transaction(
    'readwrite',
    ['settings', 'recurringItems', 'entries', 'months'],
    async (tx) => {
      await putSettings(tx, {
        id: 'app',
        currency: 'USD',
        locale: input.locale ?? 'en-US',
        weekStartsOn: input.weekStartsOn ?? 0,
        setupCompletedAt: now,
        lastBackupAt: null,
      });

      const incomeItem: RecurringItem = {
        id: deps.ids.nextId(),
        kind: 'income',
        name: 'Monthly income',
        amount: cents(input.monthlyIncome),
        tagIds: [],
        startMonth: currentMonth,
        endMonth: null,
        createdAt: now,
        updatedAt: now,
      };

      const expenseItems: RecurringItem[] = input.recurringExpenses.map((expense) => {
        if (expense.amount < 0) {
          throw new RangeError(`Recurring expense "${expense.name}" amount must be positive.`);
        }
        return {
          id: deps.ids.nextId(),
          kind: 'expense',
          name: expense.name.trim(),
          amount: cents(expense.amount),
          tagIds: expense.tagIds ? [...expense.tagIds] : [],
          startMonth: currentMonth,
          endMonth: null,
          createdAt: now,
          updatedAt: now,
        };
      });

      const allItems = [incomeItem, ...expenseItems];
      for (const item of allItems) {
        await putRecurringItem(tx, item);
      }

      const existingEntriesInCurrentMonth = await getEntriesForMonth(tx, currentMonth);
      const existingRecurrenceKeys = new Set(
        existingEntriesInCurrentMonth.flatMap((entry) =>
          entry.recurrenceKey ? [entry.recurrenceKey] : [],
        ),
      );

      const snapshotEntries = recurringEntriesToOpen({
        items: allItems,
        month: currentMonth,
        existingRecurrenceKeys,
        nextId: () => deps.ids.nextId(),
        now,
      });

      for (const entry of snapshotEntries) {
        await addLedgerEntry(tx, entry);
      }

      await putOpenedMonth(tx, {
        monthKey: currentMonth,
        openedAt: now,
      });

      const [entriesBefore, entriesIn] = await Promise.all([
        getEntriesBeforeMonth(tx, currentMonth),
        getEntriesForMonth(tx, currentMonth),
      ]);

      return monthStatement({
        month: currentMonth,
        entriesBefore,
        entriesIn,
      });
    },
  );
}

export async function addEntry(deps: AppDependencies, input: AddEntryInput): Promise<LedgerEntry> {
  if (input.amount <= 0) {
    throw new RangeError('Manual entry amount must be greater than zero.');
  }
  const now = deps.clock.now();
  const pickedDate = assertIsoDate(input.date ?? deps.clock.today());
  const occurredAt = instantFromLocal(pickedDate, input.time ?? localTimeOf(now));
  const date = localDateOf(occurredAt);
  const monthKey = monthKeyOf(date);
  const signedAmount = input.kind === 'expense' ? negate(input.amount) : cents(input.amount);
  const defaultName = input.kind === 'expense' ? 'Expense' : 'Deposit';
  const trimmedName = (input.name ?? '').trim();

  const entry: LedgerEntry = {
    id: deps.ids.nextId(),
    occurredAt,
    date,
    monthKey,
    amount: signedAmount,
    name: trimmedName.length > 0 ? trimmedName : defaultName,
    note: (input.note ?? '').trim(),
    tagIds: input.tagIds ? [...input.tagIds] : [],
    source: 'manual',
    recurringItemId: null,
    createdAt: now,
    updatedAt: now,
  };

  await deps.db.transaction('readwrite', ['entries'], async (tx) => {
    await addLedgerEntry(tx, entry);
  });

  return entry;
}

export async function updateEntry(
  deps: AppDependencies,
  input: UpdateEntryInput,
): Promise<LedgerEntry> {
  const now = deps.clock.now();

  return deps.db.transaction('readwrite', ['entries'], async (tx) => {
    const existing = await getLedgerEntryById(tx, input.id);
    if (!existing) {
      throw new Error(`Ledger entry "${input.id}" was not found.`);
    }

    const kind: ManualEntryKind = existing.amount < 0 ? 'expense' : 'deposit';
    let nextAmount = existing.amount;
    if (input.amount !== undefined) {
      if (input.amount <= 0) {
        throw new RangeError('Manual entry amount must be greater than zero.');
      }
      nextAmount = kind === 'expense' ? negate(input.amount) : cents(input.amount);
    }

    const existingInstant = entryInstant(existing);
    const nextOccurredAt =
      input.date !== undefined || input.time !== undefined
        ? instantFromLocal(
            input.date !== undefined ? assertIsoDate(input.date) : localDateOf(existingInstant),
            input.time ?? localTimeOf(existingInstant),
          )
        : existingInstant;
    const nextDate = localDateOf(nextOccurredAt);
    const nextMonthKey = monthKeyOf(nextDate);
    const defaultName = kind === 'expense' ? 'Expense' : 'Deposit';
    const nextName =
      input.name !== undefined
        ? input.name.trim().length > 0
          ? input.name.trim()
          : defaultName
        : existing.name;

    const updated: LedgerEntry = {
      ...existing,
      occurredAt: nextOccurredAt,
      date: nextDate,
      monthKey: nextMonthKey,
      amount: nextAmount,
      name: nextName,
      note: input.note !== undefined ? input.note.trim() : existing.note,
      tagIds: input.tagIds !== undefined ? [...input.tagIds] : existing.tagIds,
      updatedAt: now,
    };

    await putLedgerEntry(tx, updated);
    return updated;
  });
}

export async function deleteEntry(deps: AppDependencies, id: string): Promise<LedgerEntry> {
  return deps.db.transaction('readwrite', ['entries'], async (tx) => {
    const existing = await getLedgerEntryById(tx, id);
    if (!existing) {
      throw new Error(`Ledger entry "${id}" was not found.`);
    }
    if (existing.source === 'recurring') {
      throw new Error(
        'Recurring lines come from your budget plan; remove them from the plan instead of deleting them here.',
      );
    }
    await removeLedgerEntry(tx, id);
    return existing;
  });
}

export async function restoreEntry(
  deps: Pick<AppDependencies, 'db'>,
  entry: LedgerEntry,
): Promise<LedgerEntry> {
  if (entry.source === 'recurring') {
    throw new Error('Recurring lines cannot be restored from the ledger.');
  }
  await deps.db.transaction('readwrite', ['entries'], async (tx) => {
    await putLedgerEntry(tx, entry);
  });
  return entry;
}

export async function openMonthsThrough(
  deps: AppDependencies,
  targetDate: IsoDate = deps.clock.today(),
): Promise<MonthKey[]> {
  const validatedDate = assertIsoDate(targetDate);
  const targetMonth = monthKeyOf(validatedDate);
  const now = deps.clock.now();

  return deps.db.transaction(
    'readwrite',
    ['settings', 'recurringItems', 'entries', 'months'],
    async (tx) => {
      const settings = await getSettings(tx);
      if (!settings?.setupCompletedAt) {
        return [];
      }

      const latestOpened = await getLatestOpenedMonth(tx);
      if (!latestOpened) {
        return [];
      }

      const monthsToEnsure = monthsFromTo(latestOpened.monthKey, targetMonth);
      if (monthsToEnsure.length === 0) {
        return [];
      }

      const [items, openedMonths] = await Promise.all([
        listRecurringItems(tx),
        listOpenedMonths(tx),
      ]);
      const alreadyOpenedKeys = new Set(openedMonths.map((row) => row.monthKey));
      const newlyOpenedMonths: MonthKey[] = [];

      for (const month of monthsToEnsure) {
        const existingEntries = await getEntriesForMonth(tx, month);
        const existingRecurrenceKeys = new Set(
          existingEntries.flatMap((entry) => (entry.recurrenceKey ? [entry.recurrenceKey] : [])),
        );

        const entriesToSnapshot = recurringEntriesToOpen({
          items,
          month,
          existingRecurrenceKeys,
          nextId: () => deps.ids.nextId(),
          now,
        });

        for (const entry of entriesToSnapshot) {
          await addLedgerEntry(tx, entry);
        }

        if (!alreadyOpenedKeys.has(month)) {
          await putOpenedMonth(tx, {
            monthKey: month,
            openedAt: now,
          });
          alreadyOpenedKeys.add(month);
          newlyOpenedMonths.push(month);
        }
      }

      return newlyOpenedMonths;
    },
  );
}

export async function getMonthView(
  deps: Pick<AppDependencies, 'db'>,
  month: MonthKey,
): Promise<MonthStatement> {
  const validatedMonth = assertMonthKey(month);
  return deps.db.transaction('readonly', ['entries'], async (tx) => {
    const [entriesBefore, entriesIn] = await Promise.all([
      getEntriesBeforeMonth(tx, validatedMonth),
      getEntriesForMonth(tx, validatedMonth),
    ]);
    return monthStatement({
      month: validatedMonth,
      entriesBefore,
      entriesIn,
    });
  });
}
