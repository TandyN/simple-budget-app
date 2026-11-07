import { describe, expect, test } from 'vitest';
import { money } from '../../domain/test-builders';
import { formatSpokenMoney } from './AmountText';

describe('spoken accessibility labels for amounts', () => {
  test('amounts are read aloud with their sign', () => {
    expect(formatSpokenMoney(money('-$40.00'))).toBe('minus $40.00');
    expect(formatSpokenMoney(money('-$1,800.00'))).toBe('minus $1,800.00');
    expect(formatSpokenMoney(money('$5,000.00'), { sign: 'always' })).toBe('plus $5,000.00');
    expect(formatSpokenMoney(money('$3,080.00'))).toBe('$3,080.00');
    expect(formatSpokenMoney(money('$0.00'), { sign: 'always' })).toBe('$0.00');
  });
});
