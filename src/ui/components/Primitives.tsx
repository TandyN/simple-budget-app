import { useEffect, useId, useRef, type ReactNode } from 'react';
import { parseMoneyInput, type ParseMoneyResult } from '../../domain/money';
import { Button } from './Button';

export interface TextFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (nextValue: string) => void;
  readonly placeholder?: string;
  readonly error?: string | null;
  readonly inputMode?: 'text' | 'decimal' | 'numeric';
  readonly focusOnMount?: boolean;
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  error,
  inputMode = 'text',
  focusOnMount = false,
}: TextFieldProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (focusOnMount) {
      inputRef.current?.focus();
    }
  }, [focusOnMount]);

  return (
    <div className="sb-field">
      <label className="sb-field-label" htmlFor={inputId}>
        {label}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        className="sb-input"
        type="text"
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      {error ? (
        <p id={errorId} role="alert" className="sb-field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface MoneyFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (nextValue: string, parsed: ParseMoneyResult) => void;
  readonly placeholder?: string;
  readonly showErrorWhenTouched?: boolean;
  readonly focusOnMount?: boolean;
}

export function MoneyField({
  label,
  value,
  onChange,
  placeholder = '0.00',
  showErrorWhenTouched = true,
  focusOnMount = false,
}: MoneyFieldProps) {
  const parsed = parseMoneyInput(value);
  const errorMessage =
    showErrorWhenTouched && value.trim().length > 0 && !parsed.ok ? parsed.reason : null;

  return (
    <TextField
      label={label}
      value={value}
      placeholder={placeholder}
      inputMode="decimal"
      focusOnMount={focusOnMount}
      error={errorMessage}
      onChange={(nextValue) => {
        onChange(nextValue, parseMoneyInput(nextValue));
      }}
    />
  );
}

export interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

export interface SegmentedControlProps<T extends string> {
  readonly label: string;
  readonly options: readonly SegmentedOption<T>[];
  readonly value: T;
  readonly onChange: (nextValue: T) => void;
}

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div className="sb-segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className="sb-segmented-option"
          onClick={() => {
            onChange(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export interface ListRowProps {
  readonly title: ReactNode;
  readonly subtitle?: ReactNode;
  readonly trailing?: ReactNode;
}

export function ListRow({ title, subtitle, trailing }: ListRowProps) {
  return (
    <div className="sb-list-row">
      <div>
        <div>{title}</div>
        {subtitle ? (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>
            {subtitle}
          </div>
        ) : null}
      </div>
      {trailing ? <div>{trailing}</div> : null}
    </div>
  );
}

export interface EmptyStateProps {
  readonly title: string;
  readonly description?: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div style={{ padding: 'var(--space-4) 0', color: 'var(--color-ink-muted)' }}>
      <p style={{ margin: 0, fontWeight: 500, color: 'var(--color-ink)' }}>{title}</p>
      {description ? (
        <p style={{ margin: 'var(--space-1) 0 0 0', fontSize: 'var(--text-sm)' }}>{description}</p>
      ) : null}
    </div>
  );
}

export interface ToastProps {
  readonly message: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}

export function Toast({ message, actionLabel, onAction }: ToastProps) {
  return (
    <div className="sb-toast" role="status" aria-live="polite">
      <span>{message}</span>
      {actionLabel && onAction ? (
        <Button variant="secondary" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

export interface SheetProps {
  readonly open: boolean;
  readonly title: string;
  readonly layoutMode?: 'compact' | 'expanded';
  readonly onClose: () => void;
  readonly children: ReactNode;
}

export function Sheet({ open, title, layoutMode = 'compact', onClose, children }: SheetProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open && typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else if (!open && dialog.open && typeof dialog.close === 'function') {
      dialog.close();
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const classes = ['sb-sheet', layoutMode === 'compact' ? 'sb-sheet-compact' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <dialog ref={dialogRef} className={classes} aria-labelledby={titleId} onClose={onClose}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-4)',
        }}
      >
        <h2 id={titleId} style={{ margin: 0, fontSize: 'var(--text-lg)' }}>
          {title}
        </h2>
        <Button variant="quiet" onClick={onClose}>
          Close
        </Button>
      </div>
      {children}
    </dialog>
  );
}
