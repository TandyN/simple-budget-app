import { addMonths, firstDayOf, type IsoDate, type MonthKey } from './calendar';
import { signedAmount, type LedgerEntry, type RecurringItem } from './ledger';
import { cents, formatMoney, negate, subtractCents, sumCents, type Cents } from './money';

export type PlanChangeTakesEffect = 'this-month' | 'starting-next-month';

export type BudgetPlanChange =
  | {
      readonly type: 'change-amount';
      readonly itemId: string;
      readonly newAmount: Cents;
    }
  | {
      readonly type: 'add-expense';
      readonly name: string;
      readonly amount: Cents;
      readonly tagIds?: readonly string[];
    }
  | {
      readonly type: 'remove-expense';
      readonly itemId: string;
    };

export interface PlanChangeParams {
  readonly change: BudgetPlanChange;
  readonly takesEffect: PlanChangeTakesEffect;
  readonly currentMonth: MonthKey;
  readonly dateInCurrentMonth?: IsoDate;
  readonly itemsNow: readonly RecurringItem[];
  readonly entriesThisMonth: readonly LedgerEntry[];
  readonly nextId: () => string;
  readonly now: string;
}

export interface PlanChangeResult {
  readonly itemUpserts: readonly RecurringItem[];
  readonly entriesToAdd: readonly LedgerEntry[];
}

export function effectiveSignedAmountInMonth(
  itemId: string,
  entriesThisMonth: readonly LedgerEntry[],
): Cents {
  return sumCents(
    entriesThisMonth
      .filter((entry) => entry.recurringItemId === itemId)
      .map((entry) => entry.amount),
  );
}

function findItemOrThrow(items: readonly RecurringItem[], itemId: string): RecurringItem {
  const found = items.find((item) => item.id === itemId);
  if (!found) {
    throw new RangeError(`Recurring item "${itemId}" was not found in the budget plan.`);
  }
  return found;
}

export function planChange(params: PlanChangeParams): PlanChangeResult {
  const {
    change,
    takesEffect,
    currentMonth,
    dateInCurrentMonth,
    itemsNow,
    entriesThisMonth,
    nextId,
    now,
  } = params;
  const entryDate = dateInCurrentMonth ?? firstDayOf(currentMonth);

  if (change.type === 'change-amount') {
    const item = findItemOrThrow(itemsNow, change.itemId);
    const updatedItem: RecurringItem = {
      ...item,
      amount: change.newAmount,
      updatedAt: now,
    };

    if (takesEffect === 'starting-next-month') {
      return {
        itemUpserts: [updatedItem],
        entriesToAdd: [],
      };
    }

    const currentSigned = effectiveSignedAmountInMonth(item.id, entriesThisMonth);
    const targetSigned = signedAmount({ kind: item.kind, amount: change.newAmount });
    const delta = subtractCents(targetSigned, currentSigned);
    const currentMagnitude = cents(Math.abs(currentSigned));

    if (delta === 0) {
      return {
        itemUpserts: [updatedItem],
        entriesToAdd: [],
      };
    }

    const adjustmentEntry: LedgerEntry = {
      id: nextId(),
      date: entryDate,
      monthKey: currentMonth,
      amount: delta,
      name: `${item.name} changed ${formatMoney(currentMagnitude)} → ${formatMoney(change.newAmount)}`,
      note: '',
      tagIds: [...item.tagIds],
      source: 'adjustment',
      recurringItemId: item.id,
      adjustment: {
        change: 'amount-changed',
        from: currentMagnitude,
        to: change.newAmount,
      },
      createdAt: now,
      updatedAt: now,
    };

    return {
      itemUpserts: [updatedItem],
      entriesToAdd: [adjustmentEntry],
    };
  }

  if (change.type === 'add-expense') {
    const nextMonth = addMonths(currentMonth, 1);
    const newItemId = nextId();
    const tagIds = [...(change.tagIds ?? [])];

    const newItem: RecurringItem = {
      id: newItemId,
      kind: 'expense',
      name: change.name,
      amount: change.amount,
      tagIds,
      startMonth: nextMonth,
      endMonth: null,
      createdAt: now,
      updatedAt: now,
    };

    if (takesEffect === 'starting-next-month') {
      return {
        itemUpserts: [newItem],
        entriesToAdd: [],
      };
    }

    const adjustmentEntry: LedgerEntry = {
      id: nextId(),
      date: entryDate,
      monthKey: currentMonth,
      amount: negate(change.amount),
      name: `${change.name} added for this month`,
      note: '',
      tagIds,
      source: 'adjustment',
      recurringItemId: newItemId,
      adjustment: {
        change: 'added',
        from: null,
        to: change.amount,
      },
      createdAt: now,
      updatedAt: now,
    };

    return {
      itemUpserts: [newItem],
      entriesToAdd: [adjustmentEntry],
    };
  }

  const item = findItemOrThrow(itemsNow, change.itemId);
  const endedItem: RecurringItem = {
    ...item,
    endMonth: currentMonth,
    updatedAt: now,
  };

  if (takesEffect === 'starting-next-month') {
    return {
      itemUpserts: [endedItem],
      entriesToAdd: [],
    };
  }

  const currentSigned = effectiveSignedAmountInMonth(item.id, entriesThisMonth);
  const refundDelta = negate(currentSigned);
  const currentMagnitude = cents(Math.abs(currentSigned));

  if (refundDelta === 0) {
    return {
      itemUpserts: [endedItem],
      entriesToAdd: [],
    };
  }

  const refundEntry: LedgerEntry = {
    id: nextId(),
    date: entryDate,
    monthKey: currentMonth,
    amount: refundDelta,
    name: `${item.name} removed for this month`,
    note: '',
    tagIds: [...item.tagIds],
    source: 'adjustment',
    recurringItemId: item.id,
    adjustment: {
      change: 'removed',
      from: currentMagnitude,
      to: null,
    },
    createdAt: now,
    updatedAt: now,
  };

  return {
    itemUpserts: [endedItem],
    entriesToAdd: [refundEntry],
  };
}

