import { formatMoney, type Cents, type FormatMoneyOptions } from '../../domain/money';

export interface SpokenAmountOptions extends FormatMoneyOptions {
  readonly isHeroBudget?: boolean;
}

export function formatSpokenMoney(amount: Cents, options: SpokenAmountOptions = {}): string {
  const signMode = options.sign ?? 'auto';
  const absoluteText = formatMoney(Math.abs(amount) as Cents, { sign: 'auto' });

  if (amount < 0) {
    return `minus ${absoluteText}`;
  }
  if (amount > 0 && signMode === 'always') {
    return `plus ${absoluteText}`;
  }
  return absoluteText;
}

export interface AmountTextProps {
  readonly amount: Cents;
  readonly sign?: 'auto' | 'always';
  readonly variant?: 'entry' | 'hero';
  readonly className?: string;
}

export function AmountText({
  amount,
  sign = 'auto',
  variant = 'entry',
  className = '',
}: AmountTextProps) {
  const visualText = formatMoney(amount, { sign });
  const spokenLabel = formatSpokenMoney(amount, { sign, isHeroBudget: variant === 'hero' });

  let toneClass = 'sb-amount-neutral';
  if (variant === 'hero') {
    if (amount < 0) {
      toneClass = 'sb-amount-negative-budget';
    }
  } else if (amount < 0) {
    toneClass = 'sb-amount-out';
  } else if (amount > 0 && sign === 'always') {
    toneClass = 'sb-amount-in';
  }

  const classes = ['sb-amount', variant === 'hero' ? 'sb-hero-amount' : '', toneClass, className]
    .filter(Boolean)
    .join(' ');

  return (
    <output className={classes} aria-label={spokenLabel}>
      {visualText}
    </output>
  );
}
