import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, test } from 'vitest';
import { createDatabase } from '../../data/database';
import {
  addLedgerEntry,
  getSettings,
  listOpenedMonths,
  listRecurringItems,
} from '../../data/repositories';
import { instantFromLocal } from '../../domain/instant';
import { formatMoney } from '../../domain/money';
import { anExpense, money } from '../../domain/test-builders';
import { observeMonthView } from '../hooks/useMonthView';
import { createControllableClock, createSequentialIdGenerator } from '../providers';
import {
  addEntry,
  completeSetup,
  deleteEntry,
  getMonthView,
  openMonthsThrough,
  restoreEntry,
  updateEntry,
} from './index';

function createTestApp(initialDate = '2026-11-05') {
  const db = createDatabase({ idbFactory: new IDBFactory() });
  const clock = createControllableClock(initialDate);
  const ids = createSequentialIdGenerator('test-id');
  return { db, clock, ids };
}

describe('setup, month opening and month view use-cases', () => {
  test('finishing setup saves the monthly income and recurring expenses and opens the current month', async () => {
    const app = createTestApp('2026-11-05');

    await completeSetup(app, {
      monthlyIncome: money('$5,000.00'),
      recurringExpenses: [
        { name: 'Rent', amount: money('$1,800.00') },
        { name: 'Phone', amount: money('$80.00') },
      ],
    });

    const [settings, recurringItems, openedMonths] = await app.db.transaction(
      'readonly',
      ['settings', 'recurringItems', 'months'],
      (tx) => Promise.all([getSettings(tx), listRecurringItems(tx), listOpenedMonths(tx)]),
    );

    expect(settings?.setupCompletedAt).toBe('2026-11-05T09:00:00.000Z');
    expect(recurringItems.map((item) => [item.name, item.kind, formatMoney(item.amount)])).toEqual([
      ['Monthly income', 'income', '$5,000.00'],
      ['Rent', 'expense', '$1,800.00'],
      ['Phone', 'expense', '$80.00'],
    ]);
    expect(openedMonths.map((row) => row.monthKey)).toEqual(['2026-11']);

    await app.db.close();
  });

  test('the month view after setup shows zero carried over, the income, each expense and the current budget', async () => {
    const app = createTestApp('2026-11-05');

    await completeSetup(app, {
      monthlyIncome: money('$5,000.00'),
      recurringExpenses: [
        { name: 'Rent', amount: money('$1,800.00') },
        { name: 'Phone', amount: money('$80.00') },
      ],
    });

    const november = await getMonthView(app, '2026-11');

    expect(
      november.lines.map((line) => [line.name, formatMoney(line.amount, { sign: 'always' })]),
    ).toEqual([
      ['Carried over from October', '$0.00'],
      ['Monthly income', '+$5,000.00'],
      ['Phone', '−$80.00'],
      ['Rent', '−$1,800.00'],
    ]);

    // $5,000.00 income - $1,800.00 rent - $80.00 phone = $3,120.00
    expect(formatMoney(november.currentBudget)).toBe('$3,120.00');

    await app.db.close();
  });

  test('opening months is safe to run many times: recurring lines are never duplicated', async () => {
    const app = createTestApp('2026-11-05');

    await completeSetup(app, {
      monthlyIncome: money('$5,000.00'),
      recurringExpenses: [{ name: 'Rent', amount: money('$1,800.00') }],
    });

    await openMonthsThrough(app, '2026-11-05');
    await openMonthsThrough(app, '2026-11-15');
    await openMonthsThrough(app, '2026-11-30');

    const november = await getMonthView(app, '2026-11');

    expect(
      november.lines.map((line) => [line.name, formatMoney(line.amount, { sign: 'always' })]),
    ).toEqual([
      ['Carried over from October', '$0.00'],
      ['Monthly income', '+$5,000.00'],
      ['Rent', '−$1,800.00'],
    ]);

    // $5,000.00 income - $1,800.00 rent = $3,200.00
    expect(formatMoney(november.currentBudget)).toBe('$3,200.00');

    await app.db.close();
  });

  test('opening months after two months away fills in both missing months', async () => {
    const app = createTestApp('2026-11-05');

    await completeSetup(app, {
      monthlyIncome: money('$5,000.00'),
      recurringExpenses: [{ name: 'Rent', amount: money('$1,800.00') }],
    });

    app.clock.advanceTo('2027-01-10');
    const newlyOpened = await openMonthsThrough(app);

    expect(newlyOpened).toEqual(['2026-12', '2027-01']);

    const december = await getMonthView(app, '2026-12');
    // November left $3,200.00; December adds $5,000.00 - $1,800.00 = $6,400.00
    expect(formatMoney(december.carriedOver)).toBe('$3,200.00');
    expect(formatMoney(december.currentBudget)).toBe('$6,400.00');

    const january = await getMonthView(app, '2027-01');
    // December left $6,400.00; January adds $5,000.00 - $1,800.00 = $9,600.00
    expect(formatMoney(january.carriedOver)).toBe('$6,400.00');
    expect(formatMoney(january.currentBudget)).toBe('$9,600.00');

    await app.db.close();
  });

  test('observing a month view automatically emits the updated statement when an entry is written', async () => {
    const app = createTestApp('2026-11-05');

    await completeSetup(app, {
      monthlyIncome: money('$5,000.00'),
      recurringExpenses: [{ name: 'Rent', amount: money('$1,800.00') }],
    });

    const observedBudgets: string[] = [];
    let notifyNextEmission: (() => void) | null = null;
    const waitForNextEmission = () =>
      new Promise<void>((resolve) => {
        notifyNextEmission = resolve;
      });

    const initialEmission = waitForNextEmission();
    const unsubscribe = observeMonthView(app.db, '2026-11', (statement) => {
      observedBudgets.push(formatMoney(statement.currentBudget));
      notifyNextEmission?.();
      notifyNextEmission = null;
    });

    await initialEmission;
    // Initial budget after setup: $5,000.00 - $1,800.00 = $3,200.00
    expect(observedBudgets.at(-1)).toBe('$3,200.00');

    const updatedEmission = waitForNextEmission();
    await app.db.transaction('readwrite', ['entries'], async (tx) => {
      await addLedgerEntry(
        tx,
        anExpense({
          id: 'manual-groceries',
          name: 'Groceries',
          amount: '$120.00',
          date: '2026-11-06',
        }),
      );
    });

    await updatedEmission;
    // Updated budget: $3,200.00 - $120.00 = $3,080.00
    expect(observedBudgets.at(-1)).toBe('$3,080.00');

    unsubscribe();
    await app.db.close();
  });

  test('adding, editing, deleting and restoring manual expenses and deposits updates the current budget and carry-over', async () => {
    const app = createTestApp('2026-11-05');

    await completeSetup(app, {
      monthlyIncome: money('$5,000.00'),
      recurringExpenses: [{ name: 'Rent', amount: money('$1,800.00') }],
    });

    const groceries = await addEntry(app, {
      kind: 'expense',
      name: 'Groceries',
      amount: money('$120.00'),
    });
    await addEntry(app, {
      kind: 'deposit',
      name: 'Rebate',
      amount: money('$45.00'),
    });

    let november = await getMonthView(app, '2026-11');
    // $5,000.00 income − $1,800.00 rent − $120.00 groceries + $45.00 rebate = $3,125.00
    expect(formatMoney(november.currentBudget)).toBe('$3,125.00');

    await updateEntry(app, {
      id: groceries.id,
      amount: money('$150.00'),
      name: 'Weekly groceries',
    });

    november = await getMonthView(app, '2026-11');
    // $5,000.00 income − $1,800.00 rent − $150.00 weekly groceries + $45.00 rebate = $3,095.00
    expect(formatMoney(november.currentBudget)).toBe('$3,095.00');

    const deleted = await deleteEntry(app, groceries.id);
    november = await getMonthView(app, '2026-11');
    // $3,095.00 + $150.00 deleted groceries = $3,245.00
    expect(formatMoney(november.currentBudget)).toBe('$3,245.00');

    await restoreEntry(app, deleted);
    november = await getMonthView(app, '2026-11');
    // Restored back to $3,095.00
    expect(formatMoney(november.currentBudget)).toBe('$3,095.00');

    // Expense dated in October reduces October and carries over into November
    await addEntry(app, {
      kind: 'expense',
      name: 'Late utility bill',
      amount: money('$95.00'),
      date: '2026-10-28',
    });

    november = await getMonthView(app, '2026-11');
    // Carried over from October becomes −$95.00; November current budget becomes $3,095.00 − $95.00 = $3,000.00
    expect(formatMoney(november.carriedOver)).toBe('−$95.00');
    expect(formatMoney(november.currentBudget)).toBe('$3,000.00');

    await app.db.close();
  });

  test('a new entry is stamped with a UTC time, which you can override and edit later', async () => {
    const app = createTestApp('2026-11-05');
    await completeSetup(app, { monthlyIncome: money('$1,000.00'), recurringExpenses: [] });

    const automatic = await addEntry(app, {
      kind: 'expense',
      name: 'Coffee',
      amount: money('$4.00'),
    });
    const overridden = await addEntry(app, {
      kind: 'expense',
      name: 'Lunch',
      amount: money('$12.00'),
      date: '2026-11-04',
      time: '13:15',
    });

    // Automatic: the moment it was added (09:00 UTC on the fixed test clock), stored in UTC.
    expect(automatic.occurredAt).toBe('2026-11-05T09:00:00.000Z');
    // Overridden: exactly the local date and time that was typed, converted to UTC.
    expect(overridden.occurredAt).toBe(instantFromLocal('2026-11-04', '13:15'));
    expect(overridden.date).toBe('2026-11-04');

    const moved = await updateEntry(app, { id: overridden.id, time: '18:45' });
    expect(moved.occurredAt).toBe(instantFromLocal('2026-11-04', '18:45'));

    const view = await getMonthView(app, '2026-11');
    // Newest first: Coffee (Nov 5) then Lunch (Nov 4), with the recurring income at the very end.
    expect(view.activity.map((entry) => entry.name)).toEqual(['Coffee', 'Lunch', 'Monthly income']);

    await app.db.close();
  });

  test('recurring lines can be edited like any other transaction, but not deleted from the ledger', async () => {
    const app = createTestApp('2026-11-05');
    await completeSetup(app, {
      monthlyIncome: money('$5,000.00'),
      recurringExpenses: [{ name: 'Rent', amount: money('$1,800.00') }],
    });
    const before = await getMonthView(app, '2026-11');
    const rent = before.activity.find((entry) => entry.name === 'Rent');
    expect(rent).toBeDefined();

    await updateEntry(app, { id: rent?.id ?? '', amount: money('$1,700.00') });
    const after = await getMonthView(app, '2026-11');
    // $5,000.00 income − $1,700.00 edited rent = $3,300.00 (the budget plan itself is unchanged)
    expect(formatMoney(after.currentBudget)).toBe('$3,300.00');

    await expect(deleteEntry(app, rent?.id ?? '')).rejects.toThrow(/budget plan/);

    await app.db.close();
  });
});
