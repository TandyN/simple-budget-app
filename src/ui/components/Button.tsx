import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: 'primary' | 'secondary' | 'quiet';
  readonly children: ReactNode;
}

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const classes = [`sb-btn`, `sb-btn-${variant}`, className].filter(Boolean).join(' ');
  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly label: string;
  readonly children: ReactNode;
}

export function IconButton({
  label,
  className = '',
  type = 'button',
  children,
  ...rest
}: IconButtonProps) {
  const classes = ['sb-icon-btn', className].filter(Boolean).join(' ');
  return (
    <button type={type} aria-label={label} className={classes} {...rest}>
      {children}
    </button>
  );
}
