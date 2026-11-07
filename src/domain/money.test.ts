import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import {
  addCents,
  cents,
  formatMoney,
  MAX_AMOUNT_CENTS,
  negate,
  parseMoneyInput,
  subtractCents,
  sumCents,
} from './money';
import { money } from './test-builders';

describe('money parsing and formatting', () => {
  test('typing 12.5 means twelve dollars and fifty cents', () => {
    const parsed = parseMoneyInput('12.5');

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      throw new Error(parsed.reason);
    }
    // 12.5 dollars = $12.50
    expect(formatMoney(parsed.cents)).toBe('$12.50');
  });

  test('typing $1,234.56 with a dollar sign and comma is understood', () => {
    const parsed = parseMoneyInput('  $1,234.56  ');

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      throw new Error(parsed.reason);
    }
    // $1,234.56 = 1,234 dollars and 56 cents
    expect(formatMoney(parsed.cents)).toBe('$1,234.56');
  });

  test('typing a whole dollar amount or leading zeros is understood', () => {
    const wholeDollars = parseMoneyInput('000');
    const trailingDot = parseMoneyInput('45.');

    expect(wholeDollars).toEqual({ ok: true, cents: cents(0) });
    expect(trailingDot).toEqual({ ok: true, cents: money('$45.00') });
  });

  test('amounts with three decimal places are rejected with a helpful message', () => {
    const parsed = parseMoneyInput('12.345');

    expect(parsed).toEqual({
      ok: false,
      reason: 'Amounts can have at most two decimal places (cents).',
    });
  });

  test('negative, empty and non-numeric amounts are rejected', () => {
    expect(parseMoneyInput('')).toEqual({
      ok: false,
      reason: 'Please enter an amount.',
    });
    expect(parseMoneyInput('$   ')).toEqual({
      ok: false,
      reason: 'Please enter an amount.',
    });
    expect(parseMoneyInput('-40.00')).toEqual({
      ok: false,
      reason: 'Enter a positive amount.',
    });
    expect(parseMoneyInput('−40.00')).toEqual({
      ok: false,
      reason: 'Enter a positive amount.',
    });
    expect(parseMoneyInput('twelve')).toEqual({
      ok: false,
      reason: 'Enter a valid dollar amount using numbers, like 12.50.',
    });
  });

  test('amounts over $99,999,999.99 are rejected', () => {
    expect(parseMoneyInput('100000000.00')).toEqual({
      ok: false,
      reason: 'Amount cannot exceed $99,999,999.99.',
    });
  });

  test('negative amounts are shown with a true minus sign: −$40.00', () => {
    const fortyDollarsOut = negate(money('$40.00'));

    // -$40.00 uses the Unicode minus sign "−"
    expect(formatMoney(fortyDollarsOut)).toBe('−$40.00');
  });

  test('money in is shown with a plus sign when asked: +$500.00', () => {
    const fiveHundredIn = money('$500.00');
    const zeroAmount = money('$0.00');

    // +$500.00 when sign is always shown; $0.00 never shows a plus sign
    expect(formatMoney(fiveHundredIn, { sign: 'always' })).toBe('+$500.00');
    expect(formatMoney(zeroAmount, { sign: 'always' })).toBe('$0.00');
  });

  test('cents guard rejects non-integer numbers and normalizes negative zero', () => {
    expect(() => cents(12.34)).toThrow(RangeError);
    expect(Object.is(cents(-0), 0)).toBe(true);
  });

  test('adding, subtracting, and summing cents stays exact in integer cents', () => {
    const income = money('$5,000.00');
    const rent = money('$1,800.00');
    const groceries = money('$120.55');

    // $5,000.00 − $1,800.00 = $3,200.00
    expect(formatMoney(subtractCents(income, rent))).toBe('$3,200.00');
    // $1,800.00 + $120.55 = $1,920.55
    expect(formatMoney(addCents(rent, groceries))).toBe('$1,920.55');
    // $5,000.00 − $1,800.00 − $120.55 = $3,079.45
    expect(formatMoney(sumCents([income, negate(rent), negate(groceries)]))).toBe('$3,079.45');
  });

  test('for any amount, formatting then parsing gives back the same cents', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_AMOUNT_CENTS }), (rawCents) => {
        const original = cents(rawCents);
        const formatted = formatMoney(original);
        const reparsed = parseMoneyInput(formatted);

        expect(reparsed).toEqual({ ok: true, cents: original });
      }),
    );
  });
});

