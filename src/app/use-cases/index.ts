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
  monthStatement,
  recurringEntriesToOpen,
  type MonthStatement,
  type RecurringItem,
} from '../../domain/ledger';
import { cents, type Cents } from '../../domain/money';
import type { SimpleBudgetDatabase } from '../../data/database';
import {
  addLedgerEntry,
  getEntriesBeforeMonth,
  getEntriesForMonth,
  getLatestOpenedMonth,
  getSettings,
  listOpenedMonths,
  listRecurringItems,
  putOpenedMonth,
  putRecurringItem,
  putSettings,
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
