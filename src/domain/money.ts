export type Cents = number & { readonly __brand: 'Cents' };

export const ZERO_CENTS = 0 as Cents;
export const MAX_AMOUNT_CENTS = 9_999_999_99 as Cents;

const USD_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function cents(value: number): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Money must be a safe integer number of cents, received ${String(value)}`);
  }
  const normalized = value === 0 ? 0 : value;
  return normalized as Cents;
}

export type ParseMoneyResult =
  | { readonly ok: true; readonly cents: Cents }
  | { readonly ok: false; readonly reason: string };

export function parseMoneyInput(text: string): ParseMoneyResult {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: 'Please enter an amount.' };
  }

  if (trimmed.startsWith('-') || trimmed.startsWith('−')) {
    return { ok: false, reason: 'Enter a positive amount.' };
  }

  const withoutDollar = trimmed.startsWith('$') ? trimmed.slice(1).trim() : trimmed;
  if (withoutDollar.length === 0) {
    return { ok: false, reason: 'Please enter an amount.' };
  }

  const withoutCommas = withoutDollar.replace(/,/g, '');
  if (!/^\d+(\.\d*)?$/.test(withoutCommas)) {
    return { ok: false, reason: 'Enter a valid dollar amount using numbers, like 12.50.' };
  }

  const [wholeRaw = '0', fractionRaw = ''] = withoutCommas.split('.');
  if (fractionRaw.length > 2) {
    return { ok: false, reason: 'Amounts can have at most two decimal places (cents).' };
  }

  const significantWhole = wholeRaw.replace(/^0+/, '') || '0';
  if (significantWhole.length > 8) {
    return { ok: false, reason: 'Amount cannot exceed $99,999,999.99.' };
  }

  const wholeDollars = Number(significantWhole);
  const fractionCents = Number(fractionRaw.padEnd(2, '0'));
  const totalCents = wholeDollars * 100 + fractionCents;

  return { ok: true, cents: cents(totalCents) };
}

export interface FormatMoneyOptions {
  readonly sign?: 'auto' | 'always';
}

export function formatMoney(amount: Cents, options: FormatMoneyOptions = {}): string {
  const signMode = options.sign ?? 'auto';
  const absoluteDollars = Math.abs(amount) / 100;
  const formattedAbsolute = USD_FORMATTER.format(absoluteDollars);

  if (amount < 0) {
    return `−${formattedAbsolute}`;
  }
  if (amount > 0 && signMode === 'always') {
    return `+${formattedAbsolute}`;
  }
  return formattedAbsolute;
}

export function addCents(left: Cents, right: Cents): Cents {
  return cents(left + right);
}

export function subtractCents(left: Cents, right: Cents): Cents {
  return cents(left - right);
}

export function negate(amount: Cents): Cents {
  return cents(0 - amount);
}

export function sumCents(amounts: Iterable<Cents>): Cents {
  let total = 0;
  for (const amount of amounts) {
    total += amount;
  }
  return cents(total);
}
