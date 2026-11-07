import { useEffect, useState } from 'react';
import { isValidIsoDate, type IsoDate } from '../../../domain/calendar';
import {
  formatLocalTime,
  isLocalTime,
  localDateOf,
  localTimeOf,
  type LocalTime,
} from '../../../domain/instant';
import { entryInstant, type LedgerEntry } from '../../../domain/ledger';
import { cents, formatMoney, negate, parseMoneyInput, type Cents } from '../../../domain/money';
import type { ManualEntryKind } from '../../../app/use-cases';
import { Button, MoneyField, Sheet, TextField } from '../../components';
import type { LayoutMode } from '../../layout';

export interface EntrySheetSubmitValue {
  readonly kind: ManualEntryKind;
  readonly amount: Cents;
  readonly name: string;
  readonly date: IsoDate;
  /** Only present when the "Set time" toggle is on; otherwise the app picks the time. */
  readonly time?: LocalTime;
  readonly note: string;
}

export interface EntrySheetProps {
  readonly open: boolean;
  readonly mode: 'add' | 'edit';
  readonly kind: ManualEntryKind;
  readonly initialEntry?: LedgerEntry | null;
  readonly defaultDate: IsoDate;
  readonly defaultTime: LocalTime;
  readonly layoutMode: LayoutMode;
  readonly onClose: () => void;
  readonly onSave: (value: EntrySheetSubmitValue) => Promise<void>;
  readonly onDelete?: () => Promise<void>;
}

function formatInputAmountFromCents(amount: Cents): string {
  const positive = amount < 0 ? negate(amount) : cents(amount);
  return formatMoney(positive, { sign: 'auto' });
}

export function EntrySheet({
  open,
  mode,
  kind,
  initialEntry,
  defaultDate,
  defaultTime,
  layoutMode,
  onClose,
  onSave,
  onDelete,
}: EntrySheetProps) {
  const [amountText, setAmountText] = useState('');
  const [name, setName] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [overrideTime, setOverrideTime] = useState(false);
  const [time, setTime] = useState(defaultTime);
  const [note, setNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (mode === 'edit' && initialEntry) {
      setAmountText(formatInputAmountFromCents(initialEntry.amount));
      setName(initialEntry.name);
      setDate(localDateOf(entryInstant(initialEntry)));
      setTime(localTimeOf(entryInstant(initialEntry)));
      setOverrideTime(false);
      setNote(initialEntry.note);
      setNoteOpen(initialEntry.note.trim().length > 0);
    } else {
      setAmountText('');
      setName('');
      setDate(defaultDate);
      setTime(defaultTime);
      setOverrideTime(false);
      setNote('');
      setNoteOpen(false);
    }
  }, [open, mode, initialEntry, defaultDate, defaultTime]);

  const parsedAmount = parseMoneyInput(amountText);
  const isAmountValid = parsedAmount.ok && parsedAmount.cents > 0;
  const isDateValid = isValidIsoDate(date.trim());
  const isTimeValid = !overrideTime || isLocalTime(time);
  const canSave = isAmountValid && isDateValid && isTimeValid && !isSaving;
  const shownTime =
    mode === 'edit' && initialEntry
      ? formatLocalTime(entryInstant(initialEntry))
      : formatLocalTime(
          new Date(
            Number(defaultDate.slice(0, 4)),
            Number(defaultDate.slice(5, 7)) - 1,
            Number(defaultDate.slice(8, 10)),
            Number(defaultTime.slice(0, 2)),
            Number(defaultTime.slice(3, 5)),
          ).toISOString(),
        );

  const sheetTitle =
    mode === 'edit'
      ? kind === 'expense'
        ? 'Edit expense'
        : 'Edit deposit'
      : kind === 'expense'
        ? 'Add expense'
        : 'Add deposit';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!parsedAmount.ok || parsedAmount.cents <= 0 || !isDateValid || !isTimeValid || isSaving) {
      return;
    }
    setIsSaving(true);
    try {
      await onSave({
        kind,
        amount: parsedAmount.cents,
        name,
        date: date.trim(),
        ...(overrideTime ? { time } : {}),
        note,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Sheet open={open} title={sheetTitle} layoutMode={layoutMode} onClose={onClose}>
      <form
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <MoneyField
          label="Amount"
          placeholder="0.00"
          value={amountText}
          focusOnMount={open}
          onChange={(nextValue) => {
            setAmountText(nextValue);
          }}
        />

        <TextField label="Description" placeholder="What was it?" value={name} onChange={setName} />

        <TextField label="Date" type="date" value={date} onChange={setDate} />

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            fontSize: 'var(--text-sm)',
          }}
        >
          <input
            type="checkbox"
            checked={overrideTime}
            onChange={(event) => {
              setOverrideTime(event.target.checked);
            }}
          />
          Set time
          {overrideTime ? null : (
            <span style={{ color: 'var(--color-ink-muted)' }}>(currently {shownTime})</span>
          )}
        </label>
        {overrideTime ? (
          <TextField label="Time" type="time" value={time} onChange={setTime} />
        ) : null}

        {/* T11 tag picker slot */}
        <div data-tag-picker-slot="true" hidden />

        {noteOpen ? (
          <TextField label="Note" placeholder="Optional note" value={note} onChange={setNote} />
        ) : (
          <div>
            <Button
              variant="quiet"
              onClick={() => {
                setNoteOpen(true);
              }}
            >
              Add note
            </Button>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
          }}
        >
          {mode === 'edit' && onDelete ? (
            <Button
              variant="secondary"
              onClick={() => {
                void onDelete();
              }}
            >
              Delete
            </Button>
          ) : (
            <span />
          )}

          <Button type="submit" variant="primary" disabled={!canSave}>
            Save
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
