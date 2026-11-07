import { describe, expect, test } from 'vitest';
import { planChange } from './budget-plan-changes';
import { monthStatement, recurringEntriesToOpen } from './ledger';
import { formatMoney } from './money';
import { aRecurringExpense, aRecurringIncome, money } from './test-builders';

describe('budget plan changes (this month vs starting next month)', () => {
  test('raising income this month adds a +$500.00 adjustment and changes the plan from next month', () => {
    const income = aRecurringIncome({ id: 'inc-1', amount: '$5,000.00', startMonth: '2026-11' });
    const entriesThisMonth = recurringEntriesToOpen({
      items: [income],
      month: '2026-11',
      existingRecurrenceKeys: new Set(),
      nextId: () => 'snap-1',
      now: '2026-11-01T08:00:00.000Z',
    });

    const result = planChange({
      change: { type: 'change-amount', itemId: 'inc-1', newAmount: money('$5,500.00') },
      takesEffect: 'this-month',
      currentMonth: '2026-11',
      dateInCurrentMonth: '2026-11-10',
      itemsNow: [income],
      entriesThisMonth,
      nextId: () => 'adj-1',
      now: '2026-11-10T12:00:00.000Z',
    });

    // $5,500.00 new income − $5,000.00 snapshot = +$500.00 adjustment
    expect(result.entriesToAdd.map((e) => formatMoney(e.amount, { sign: 'always' }))).toEqual([
      '+$500.00',
    ]);
    expect(result.entriesToAdd[0]?.name).toBe('Monthly income changed $5,000.00 → $5,500.00');
    expect(result.itemUpserts.map((item) => formatMoney(item.amount))).toEqual(['$5,500.00']);
  });

  test('raising income starting next month changes the plan but adds no adjustment', () => {
    const income = aRecurringIncome({ id: 'inc-1', amount: '$5,000.00', startMonth: '2026-11' });
    const entriesThisMonth = recurringEntriesToOpen({
      items: [income],
      month: '2026-11',
      existingRecurrenceKeys: new Set(),
      nextId: () => 'snap-1',
      now: '2026-11-01T08:00:00.000Z',
    });

    const result = planChange({
      change: { type: 'change-amount', itemId: 'inc-1', newAmount: money('$5,500.00') },
      takesEffect: 'starting-next-month',
      currentMonth: '2026-11',
      itemsNow: [income],
      entriesThisMonth,
      nextId: () => 'adj-1',
      now: '2026-11-10T12:00:00.000Z',
    });

    // Plan is updated to $5,500.00 for future months; November gets no adjustment
    expect(result.entriesToAdd).toEqual([]);
    expect(result.itemUpserts.map((item) => formatMoney(item.amount))).toEqual(['$5,500.00']);
  });

  test('lowering income this month adds a negative adjustment', () => {
    const income = aRecurringIncome({ id: 'inc-1', amount: '$5,000.00', startMonth: '2026-11' });
    const entriesThisMonth = recurringEntriesToOpen({
      items: [income],
      month: '2026-11',
      existingRecurrenceKeys: new Set(),
      nextId: () => 'snap-1',
      now: '2026-11-01T08:00:00.000Z',
    });

    const result = planChange({
      change: { type: 'change-amount', itemId: 'inc-1', newAmount: money('$4,600.00') },
      takesEffect: 'this-month',
      currentMonth: '2026-11',
      itemsNow: [income],
      entriesThisMonth,
      nextId: () => 'adj-1',
      now: '2026-11-12T12:00:00.000Z',
    });

    // $4,600.00 new income − $5,000.00 snapshot = −$400.00 adjustment
    expect(result.entriesToAdd.map((e) => formatMoney(e.amount, { sign: 'always' }))).toEqual([
      '−$400.00',
    ]);
  });

  test('adding a recurring expense this month adds a negative adjustment and starts it next month', () => {
    let idSeq = 0;
    const result = planChange({
      change: {
        type: 'add-expense',
        name: 'Streaming',
        amount: money('$20.00'),
        tagIds: ['tag-fun'],
      },
      takesEffect: 'this-month',
      currentMonth: '2026-11',
      itemsNow: [],
      entriesThisMonth: [],
      nextId: () => `gen-${String(++idSeq)}`,
      now: '2026-11-15T12:00:00.000Z',
    });

    // Starts in December (2026-12) and deducts −$20.00 in November via an adjustment line
    expect(result.itemUpserts[0]?.startMonth).toBe('2026-12');
    expect(result.itemUpserts[0]?.tagIds).toEqual(['tag-fun']);
    expect(result.entriesToAdd.map((e) => formatMoney(e.amount, { sign: 'always' }))).toEqual([
      '−$20.00',
    ]);
    expect(result.entriesToAdd[0]?.name).toBe('Streaming added for this month');
  });

  test('adding a recurring expense starting next month creates the item for next month with no adjustment', () => {
    const result = planChange({
      change: {
        type: 'add-expense',
        name: 'Insurance',
        amount: money('$110.00'),
      },
      takesEffect: 'starting-next-month',
      currentMonth: '2026-11',
      itemsNow: [],
      entriesThisMonth: [],
      nextId: () => 'new-item-1',
      now: '2026-11-15T12:00:00.000Z',
    });

    expect(result.itemUpserts[0]?.startMonth).toBe('2026-12');
    expect(result.entriesToAdd).toEqual([]);
  });

  test('removing a recurring expense this month refunds it with a positive adjustment and ends it this month', () => {
    const gym = aRecurringExpense({
      id: 'exp-gym',
      name: 'Gym',
      amount: '$50.00',
      startMonth: '2026-11',
    });
    const entriesThisMonth = recurringEntriesToOpen({
      items: [gym],
      month: '2026-11',
      existingRecurrenceKeys: new Set(),
      nextId: () => 'snap-gym',
      now: '2026-11-01T08:00:00.000Z',
    });

    const result = planChange({
      change: { type: 'remove-expense', itemId: 'exp-gym' },
      takesEffect: 'this-month',
      currentMonth: '2026-11',
      itemsNow: [gym],
      entriesThisMonth,
      nextId: () => 'adj-refund',
      now: '2026-11-14T12:00:00.000Z',
    });

    // Ends in 2026-11 and adds +$50.00 refund adjustment so November net is $0.00
    expect(result.itemUpserts[0]?.endMonth).toBe('2026-11');
    expect(result.entriesToAdd.map((e) => formatMoney(e.amount, { sign: 'always' }))).toEqual([
      '+$50.00',
    ]);
    expect(result.entriesToAdd[0]?.name).toBe('Gym removed for this month');
  });

  test('removing a recurring expense starting next month keeps it this month only', () => {
    const gym = aRecurringExpense({
      id: 'exp-gym',
      name: 'Gym',
      amount: '$50.00',
      startMonth: '2026-11',
    });
    const entriesThisMonth = recurringEntriesToOpen({
      items: [gym],
      month: '2026-11',
      existingRecurrenceKeys: new Set(),
      nextId: () => 'snap-gym',
      now: '2026-11-01T08:00:00.000Z',
    });

    const result = planChange({
      change: { type: 'remove-expense', itemId: 'exp-gym' },
      takesEffect: 'starting-next-month',
      currentMonth: '2026-11',
      itemsNow: [gym],
      entriesThisMonth,
      nextId: () => 'adj-none',
      now: '2026-11-14T12:00:00.000Z',
    });

    // endMonth = 2026-11 so it stays active in November and stops in December; no adjustment
    expect(result.itemUpserts[0]?.endMonth).toBe('2026-11');
    expect(result.entriesToAdd).toEqual([]);
  });

  test('changing an amount twice in one month only adjusts by the total difference', () => {
    const rent = aRecurringExpense({
      id: 'exp-rent',
      name: 'Rent',
      amount: '$1,800.00',
      startMonth: '2026-11',
    });
    const initialEntries = recurringEntriesToOpen({
      items: [rent],
      month: '2026-11',
      existingRecurrenceKeys: new Set(),
      nextId: () => 'snap-rent',
      now: '2026-11-01T08:00:00.000Z',
    });

    const firstChange = planChange({
      change: { type: 'change-amount', itemId: 'exp-rent', newAmount: money('$1,900.00') },
      takesEffect: 'this-month',
      currentMonth: '2026-11',
      itemsNow: [rent],
      entriesThisMonth: initialEntries,
      nextId: () => 'adj-1',
      now: '2026-11-05T12:00:00.000Z',
    });

    const secondChange = planChange({
      change: { type: 'change-amount', itemId: 'exp-rent', newAmount: money('$1,950.00') },
      takesEffect: 'this-month',
      currentMonth: '2026-11',
      itemsNow: firstChange.itemUpserts,
      entriesThisMonth: [...initialEntries, ...firstChange.entriesToAdd],
      nextId: () => 'adj-2',
      now: '2026-11-10T12:00:00.000Z',
    });

    const statement = monthStatement({
      month: '2026-11',
      entriesBefore: [],
      entriesIn: [...initialEntries, ...firstChange.entriesToAdd, ...secondChange.entriesToAdd],
    });

    // First adjustment is −$100.00 ($1,800 -> $1,900); second is −$50.00 ($1,900 -> $1,950); total = −$1,950.00
    expect(firstChange.entriesToAdd.map((e) => formatMoney(e.amount, { sign: 'always' }))).toEqual([
      '−$100.00',
    ]);
    expect(secondChange.entriesToAdd.map((e) => formatMoney(e.amount, { sign: 'always' }))).toEqual(
      ['−$50.00'],
    );
    expect(formatMoney(statement.currentBudget)).toBe('−$1,950.00');
  });

  test('no-op amount change, already-refunded removal, and missing item id are handled cleanly', () => {
    const rent = aRecurringExpense({
      id: 'exp-rent',
      name: 'Rent',
      amount: '$1,800.00',
      startMonth: '2026-11',
    });
    const entriesThisMonth = recurringEntriesToOpen({
      items: [rent],
      month: '2026-11',
      existingRecurrenceKeys: new Set(),
      nextId: () => 'snap-rent',
      now: '2026-11-01T08:00:00.000Z',
    });

    const sameAmount = planChange({
      change: { type: 'change-amount', itemId: 'exp-rent', newAmount: money('$1,800.00') },
      takesEffect: 'this-month',
      currentMonth: '2026-11',
      itemsNow: [rent],
      entriesThisMonth,
      nextId: () => 'adj-noop',
      now: '2026-11-05T12:00:00.000Z',
    });
    expect(sameAmount.entriesToAdd).toEqual([]);

    const removeUnsnapshotted = planChange({
      change: { type: 'remove-expense', itemId: 'exp-rent' },
      takesEffect: 'this-month',
      currentMonth: '2026-11',
      itemsNow: [rent],
      entriesThisMonth: [],
      nextId: () => 'adj-noop-2',
      now: '2026-11-05T12:00:00.000Z',
    });
    expect(removeUnsnapshotted.entriesToAdd).toEqual([]);

    expect(() =>
      planChange({
        change: { type: 'change-amount', itemId: 'non-existent', newAmount: money('$100.00') },
        takesEffect: 'this-month',
        currentMonth: '2026-11',
        itemsNow: [rent],
        entriesThisMonth: [],
        nextId: () => 'adj-err',
        now: '2026-11-05T12:00:00.000Z',
      }),
    ).toThrow(RangeError);
  });
});
