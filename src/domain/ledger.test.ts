import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import {
  entryInstant,
  monthStatement,
  purchasePower,
  recurrenceKeyFor,
  recurringEntriesToOpen,
  type LedgerEntry,
} from './ledger';
import { cents, formatMoney, sumCents } from './money';
import {
  aDeposit,
  aMonthStatement,
  anExpense,
  aRecurringExpense,
  aRecurringIncome,
  monthlyIncome,
  openNextMonth,
  recurringExpense,
} from './test-builders';

describe('month ledger math and rollover', () => {
  test('the very first month carries over zero', () => {
    const november = aMonthStatement({
      month: '2026-11',
      lines: [monthlyIncome('$5,000.00')],
    });

    // First month has no prior history, so carried over is $0.00
    expect(november.carriedOverLabel).toBe('Carried over from October');
    expect(formatMoney(november.carriedOver)).toBe('$0.00');
  });

  test('the current budget is carried over plus income minus expenses', () => {
    const november = aMonthStatement({
      month: '2026-11',
      carriedOver: '$250.00',
      lines: [
        recurringExpense('Rent', '$1,800.00'),
        monthlyIncome('$5,000.00'),
        recurringExpense('Gym', '$50.00'),
        anExpense({ name: 'Groceries', amount: '$70.00', date: '2026-11-05' }),
        aDeposit({ name: 'Rebate', amount: '$40.00', date: '2026-11-06' }),
      ],
    });

    // $250.00 carried over + $5,000.00 income − $1,800.00 rent − $120.00 groceries + $40.00 rebate = $3,370.00
    expect(formatMoney(november.currentBudget)).toBe('$3,370.00');
    // $5,000.00 income + $40.00 rebate = $5,040.00 total in
    expect(formatMoney(november.totalIn)).toBe('$5,040.00');
    // −$1,800.00 rent − $120.00 groceries = −$1,920.00 total out
    expect(formatMoney(november.totalOut)).toBe('−$1,920.00');
  });

  test('whatever is left in November is carried over into December', () => {
    const november = aMonthStatement({
      month: '2026-11',
      carriedOver: '$0.00',
      lines: [monthlyIncome('$5,000.00'), recurringExpense('Rent', '$1,800.00')],
    });

    const december = openNextMonth(november);

    // $5,000.00 income − $1,800.00 rent = $3,200.00 carried over into December
    expect(december.carriedOverLabel).toBe('Carried over from November');
    expect(formatMoney(december.carriedOver)).toBe('$3,200.00');
  });

  test('overspending in November carries a negative budget into December', () => {
    const november = aMonthStatement({
      month: '2026-11',
      carriedOver: '$0.00',
      lines: [
        monthlyIncome('$2,000.00'),
        recurringExpense('Rent', '$1,800.00'),
        anExpense({ name: 'Car repair', amount: '$500.00', date: '2026-11-18' }),
      ],
    });

    const december = openNextMonth(november, [monthlyIncome('$2,000.00')]);

    // $2,000.00 income − $1,800.00 rent − $500.00 car repair = −$300.00 carried over
    expect(formatMoney(december.carriedOver)).toBe('−$300.00');
    // −$300.00 carried over + $2,000.00 December income = $1,700.00
    expect(formatMoney(december.currentBudget)).toBe('$1,700.00');
  });

  test('opening a month adds every active recurring income and expense once', () => {
    const items = [
      aRecurringExpense({ id: 'exp-rent', name: 'Rent', amount: '$1,800.00' }),
      aRecurringIncome({ id: 'inc-main', name: 'Monthly income', amount: '$5,000.00' }),
      aRecurringExpense({ id: 'exp-gym', name: 'Gym', amount: '$50.00' }),
      aRecurringExpense({ id: 'exp-gym-2', name: 'Gym', amount: '$25.00' }),
    ];

    let idSeq = 0;
    const opened = recurringEntriesToOpen({
      items,
      month: '2026-11',
      existingRecurrenceKeys: new Set(),
      nextId: () => `entry-${String(++idSeq)}`,
      now: '2026-11-01T08:00:00.000Z',
    });

    // Monthly income comes first, then recurring expenses ordered alphabetically by name (then id)
    expect(
      opened.map((entry) => [entry.name, formatMoney(entry.amount, { sign: 'always' })]),
    ).toEqual([
      ['Monthly income', '+$5,000.00'],
      ['Gym', '−$50.00'],
      ['Gym', '−$25.00'],
      ['Rent', '−$1,800.00'],
    ]);
  });

  test('opening the same month twice adds nothing the second time', () => {
    const items = [
      aRecurringIncome({ id: 'inc-main', amount: '$5,000.00' }),
      aRecurringExpense({ id: 'exp-rent', name: 'Rent', amount: '$1,800.00' }),
    ];

    const firstOpen = recurringEntriesToOpen({
      items,
      month: '2026-11',
      existingRecurrenceKeys: new Set(),
      nextId: () => 'entry-1',
      now: '2026-11-01T08:00:00.000Z',
    });

    const existingKeys = new Set(
      firstOpen.map((entry) => entry.recurrenceKey ?? recurrenceKeyFor('2026-11', entry.id)),
    );

    const secondOpen = recurringEntriesToOpen({
      items,
      month: '2026-11',
      existingRecurrenceKeys: existingKeys,
      nextId: () => 'entry-2',
      now: '2026-11-01T09:00:00.000Z',
    });

    expect(secondOpen).toEqual([]);
  });

  test('a recurring expense that ended in November is not added in December', () => {
    const items = [
      aRecurringIncome({ id: 'inc-main', amount: '$5,000.00', startMonth: '2026-11' }),
      aRecurringExpense({
        id: 'exp-loan',
        name: 'Car payment',
        amount: '$350.00',
        startMonth: '2026-11',
        endMonth: '2026-11',
      }),
    ];

    const decemberEntries = recurringEntriesToOpen({
      items,
      month: '2026-12',
      existingRecurrenceKeys: new Set(),
      nextId: () => 'dec-1',
      now: '2026-12-01T08:00:00.000Z',
    });

    expect(decemberEntries.map((entry) => entry.name)).toEqual(['Monthly income']);
  });

  test('a recurring expense that starts in December is not added in November', () => {
    const items = [
      aRecurringIncome({ id: 'inc-main', amount: '$5,000.00', startMonth: '2026-11' }),
      aRecurringExpense({
        id: 'exp-internet',
        name: 'Fiber internet',
        amount: '$70.00',
        startMonth: '2026-12',
      }),
    ];

    const novemberEntries = recurringEntriesToOpen({
      items,
      month: '2026-11',
      existingRecurrenceKeys: new Set(),
      nextId: () => 'nov-1',
      now: '2026-11-01T08:00:00.000Z',
    });

    expect(novemberEntries.map((entry) => entry.name)).toEqual(['Monthly income']);
  });

  test('purchase power is monthly income minus all recurring expenses', () => {
    const items = [
      aRecurringIncome({ amount: '$5,000.00', startMonth: '2026-11' }),
      aRecurringExpense({ name: 'Rent', amount: '$1,800.00', startMonth: '2026-11' }),
      aRecurringExpense({ name: 'Phone', amount: '$80.00', startMonth: '2026-11' }),
      aRecurringExpense({ name: 'Future gym', amount: '$50.00', startMonth: '2026-12' }),
    ];

    // $5,000.00 income − $1,800.00 rent − $80.00 phone = $3,120.00 in November
    expect(formatMoney(purchasePower(items, '2026-11'))).toBe('$3,120.00');
  });

  test('activity lines are ordered newest first by date, then creation timestamp, then id', () => {
    const earlySameDay = anExpense({
      id: 'exp-a',
      name: 'Coffee',
      amount: '$5.00',
      date: '2026-11-05',
      createdAt: '2026-11-05T08:00:00.000Z',
    });
    const lateSameDayIdA = anExpense({
      id: 'exp-b',
      name: 'Lunch',
      amount: '$15.00',
      date: '2026-11-05',
      createdAt: '2026-11-05T12:00:00.000Z',
    });
    const lateSameDayIdB = anExpense({
      id: 'exp-c',
      name: 'Snack',
      amount: '$4.00',
      date: '2026-11-05',
      createdAt: '2026-11-05T12:00:00.000Z',
    });
    const newerDate = anExpense({
      id: 'exp-d',
      name: 'Dinner',
      amount: '$30.00',
      date: '2026-11-06',
      createdAt: '2026-11-06T19:00:00.000Z',
    });

    const statement = aMonthStatement({
      month: '2026-11',
      lines: [earlySameDay, lateSameDayIdA, lateSameDayIdB, newerDate],
    });

    expect(statement.activity.map((entry) => entry.name)).toEqual([
      'Dinner',
      'Snack',
      'Lunch',
      'Coffee',
    ]);

    const legacyEntry = {
      ...earlySameDay,
      occurredAt: undefined as unknown as string,
    };
    expect(entryInstant(legacyEntry)).toBe(earlySameDay.createdAt);
  });

  test('for any sequence of expenses and deposits, the current budget equals carried over plus every line', () => {
    const centsArb = fc.integer({ min: -500_000_00, max: 500_000_00 }).map(cents);

    fc.assert(
      fc.property(
        fc.array(centsArb, { minLength: 0, maxLength: 20 }),
        fc.array(centsArb, { minLength: 0, maxLength: 25 }),
        (priorAmounts, monthAmounts) => {
          const entriesBefore: LedgerEntry[] = priorAmounts.map((amount, index) => ({
            id: `before-${String(index)}`,
            date: '2026-10-15',
            occurredAt: '2026-10-15T12:00:00.000Z',
            monthKey: '2026-10',
            amount,
            name: `Prior ${String(index)}`,
            note: '',
            tagIds: [],
            source: 'manual',
            recurringItemId: null,
            createdAt: '2026-10-15T10:00:00.000Z',
            updatedAt: '2026-10-15T10:00:00.000Z',
          }));

          const entriesIn: LedgerEntry[] = monthAmounts.map((amount, index) => ({
            id: `in-${String(index)}`,
            date: '2026-11-10',
            occurredAt: '2026-11-10T12:00:00.000Z',
            monthKey: '2026-11',
            amount,
            name: `Line ${String(index)}`,
            note: '',
            tagIds: [],
            source: index === 0 ? 'recurring' : 'manual',
            recurringItemId: index === 0 ? 'rec-1' : null,
            createdAt: '2026-11-10T10:00:00.000Z',
            updatedAt: '2026-11-10T10:00:00.000Z',
          }));

          const statement = monthStatement({
            month: '2026-11',
            entriesBefore,
            entriesIn,
          });

          const sumOfAllLines = sumCents(statement.lines.map((line) => line.amount));
          expect(statement.currentBudget).toBe(sumOfAllLines);
        },
      ),
    );
  });

  test("for any months, each month's carried over equals the previous month's current budget", () => {
    const monthNetArb = fc.integer({ min: -200_000_00, max: 200_000_00 }).map(cents);

    fc.assert(
      fc.property(fc.array(monthNetArb, { minLength: 2, maxLength: 12 }), (monthlyNets) => {
        const months = [
          '2026-01',
          '2026-02',
          '2026-03',
          '2026-04',
          '2026-05',
          '2026-06',
          '2026-07',
          '2026-08',
          '2026-09',
          '2026-10',
          '2026-11',
          '2026-12',
        ];

        const allEntries: LedgerEntry[] = monthlyNets.map((amount, index) => {
          const monthKey = months[index] ?? '2026-01';
          return {
            id: `entry-${String(index)}`,
            date: `${monthKey}-05`,
            occurredAt: `${monthKey}-05T12:00:00.000Z`,
            monthKey,
            amount,
            name: `Month ${String(index)} net`,
            note: '',
            tagIds: [],
            source: 'manual',
            recurringItemId: null,
            createdAt: `${monthKey}-05T12:00:00.000Z`,
            updatedAt: `${monthKey}-05T12:00:00.000Z`,
          };
        });

        for (let i = 1; i < monthlyNets.length; i += 1) {
          const prevMonth = months[i - 1] ?? '2026-01';
          const currMonth = months[i] ?? '2026-02';

          const prevStatement = monthStatement({
            month: prevMonth,
            entriesBefore: allEntries.slice(0, i - 1),
            entriesIn: allEntries.slice(i - 1, i),
          });

          const currStatement = monthStatement({
            month: currMonth,
            entriesBefore: allEntries.slice(0, i),
            entriesIn: allEntries.slice(i, i + 1),
          });

          expect(currStatement.carriedOver).toBe(prevStatement.currentBudget);
        }
      }),
    );
  });
});
