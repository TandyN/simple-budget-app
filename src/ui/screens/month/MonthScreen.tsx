import { useState, type ReactNode } from 'react';
import type { LedgerEntry, MonthStatement } from '../../../domain/ledger';
import { AmountText, Button, EmptyState, ListRow, Sheet, TextField, Toast } from '../../components';
import { TwoPane, type LayoutMode } from '../../layout';

const SHORT_MONTH_NAMES: Record<number, string> = {
  1: 'Jan',
  2: 'Feb',
  3: 'Mar',
  4: 'Apr',
  5: 'May',
  6: 'Jun',
  7: 'Jul',
  8: 'Aug',
  9: 'Sep',
  10: 'Oct',
  11: 'Nov',
  12: 'Dec',
};

export function formatShortDate(isoDate: string): string {
  const monthNumber = Number(isoDate.slice(5, 7));
  const day = Number(isoDate.slice(8, 10));
  const shortMonth = SHORT_MONTH_NAMES[monthNumber] ?? isoDate.slice(5, 7);
  return `${shortMonth} ${String(day)}`;
}

export interface MonthScreenProps {
  readonly statement: MonthStatement;
  readonly layoutMode: LayoutMode;
  readonly actionButtons: ReactNode;
  readonly onSelectEntry?: (entry: LedgerEntry) => void;
  readonly onNavigateToSettings?: () => void;
  readonly deletedToast?: {
    readonly message: string;
    readonly onUndo: () => void;
  } | null;
}

function LedgerRowItem({
  title,
  subtitle,
  amount,
  sign,
  onClick,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly amount: MonthStatement['carriedOver'];
  readonly sign: 'auto' | 'always';
  readonly onClick?: () => void;
}) {
  if (onClick) {
    return (
      <div data-ledger-row="true" className="sb-list-row">
        <button
          type="button"
          onClick={onClick}
          style={{
            display: 'flex',
            width: '100%',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
            padding: 0,
            border: 'none',
            background: 'transparent',
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          <div>
            <div data-ledger-label="true">{title}</div>
            {subtitle ? (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>
                {subtitle}
              </div>
            ) : null}
          </div>
          <span data-ledger-amount="true">
            <AmountText amount={amount} sign={sign} />
          </span>
        </button>
      </div>
    );
  }

  return (
    <div data-ledger-row="true">
      <ListRow
        title={<span data-ledger-label="true">{title}</span>}
        subtitle={subtitle}
        trailing={
          <span data-ledger-amount="true">
            <AmountText amount={amount} sign={sign} />
          </span>
        }
      />
    </div>
  );
}

export function MonthScreen({
  statement,
  layoutMode,
  actionButtons,
  onSelectEntry,
  onNavigateToSettings,
  deletedToast,
}: MonthScreenProps) {
  const [startingPointOpen, setStartingPointOpen] = useState(true);
  const [draftNote, setDraftNote] = useState('');
  const [guardedEntry, setGuardedEntry] = useState<LedgerEntry | null>(null);

  const handleRowTap = (entry: LedgerEntry) => {
    if (entry.source !== 'manual') {
      setGuardedEntry(entry);
      return;
    }
    onSelectEntry?.(entry);
  };

  const heroSection = (
    <section className="sb-card" aria-label="Current budget summary">
      <p className="sb-hero-label">Current budget</p>
      <div data-current-budget="true">
        <AmountText amount={statement.currentBudget} variant="hero" />
      </div>
      <p
        style={{
          margin: 'var(--space-2) 0 0 0',
          fontSize: 'var(--text-xs)',
          color: 'var(--color-ink-muted)',
        }}
      >
        Quiet ledger · Your data stays on this phone
      </p>
    </section>
  );

  const draftSection = (
    <section className="sb-card" aria-label="Quick memo">
      <TextField
        label="Quick note"
        placeholder="What are you planning for?"
        value={draftNote}
        onChange={setDraftNote}
      />
    </section>
  );

  const startingPointRows = (
    <div className="sb-list">
      <LedgerRowItem
        title={statement.carriedOverLabel}
        amount={statement.carriedOver}
        sign="auto"
      />
      {statement.startingPoint.map((entry) => (
        <LedgerRowItem
          key={entry.id}
          title={entry.name}
          amount={entry.amount}
          sign="always"
          onClick={() => {
            handleRowTap(entry);
          }}
        />
      ))}
    </div>
  );

  const ledgerSection = (
    <section className="sb-card" aria-label="Month ledger">
      {layoutMode === 'compact' ? (
        <div>
          <button
            type="button"
            aria-expanded={startingPointOpen}
            onClick={() => {
              setStartingPointOpen((prev) => !prev);
            }}
            style={{
              display: 'flex',
              width: '100%',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 0,
              marginBottom: startingPointOpen ? 'var(--space-2)' : 0,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            <span className="sb-section-heading" style={{ margin: 0 }}>
              Starting point
            </span>
            <span aria-hidden="true" style={{ color: 'var(--color-ink-muted)' }}>
              {startingPointOpen ? '▾' : '▸'}
            </span>
          </button>
          {startingPointOpen ? startingPointRows : null}
        </div>
      ) : (
        <div>
          <h2 className="sb-section-heading">Starting point</h2>
          {startingPointRows}
        </div>
      )}

      <h2 className="sb-section-heading" style={{ marginTop: 'var(--space-5)' }}>
        Activity
      </h2>
      {statement.activity.length === 0 ? (
        <EmptyState title="No expenses or deposits yet" />
      ) : (
        <div className="sb-list">
          {statement.activity.map((entry) => {
            const dateSubtitle = formatShortDate(entry.date);
            const subtitle = entry.note ? `${dateSubtitle} · ${entry.note}` : dateSubtitle;
            return (
              <LedgerRowItem
                key={entry.id}
                title={entry.name}
                subtitle={subtitle}
                amount={entry.amount}
                sign="always"
                onClick={() => {
                  handleRowTap(entry);
                }}
              />
            );
          })}
        </div>
      )}
    </section>
  );

  const toastNode = deletedToast ? (
    <Toast message={deletedToast.message} actionLabel="Undo" onAction={deletedToast.onUndo} />
  ) : null;

  const guardSheet = (
    <Sheet
      open={guardedEntry !== null}
      title="Managed in your budget plan"
      layoutMode={layoutMode}
      onClose={() => {
        setGuardedEntry(null);
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <p style={{ margin: 0, color: 'var(--color-ink-muted)', fontSize: 'var(--text-sm)' }}>
          {guardedEntry ? (
            <>
              <strong>{guardedEntry.name}</strong> comes from your budget plan and cannot be edited
              directly in the ledger. Change your monthly income or recurring expenses in Settings.
            </>
          ) : null}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="primary"
            onClick={() => {
              setGuardedEntry(null);
              onNavigateToSettings?.();
            }}
          >
            Open Settings
          </Button>
        </div>
      </div>
    </Sheet>
  );

  if (layoutMode === 'expanded') {
    return (
      <>
        <TwoPane
          leftLabel="Overview pane"
          rightLabel="Ledger pane"
          left={
            <>
              {heroSection}
              {draftSection}
              {actionButtons}
              {toastNode}
            </>
          }
          right={ledgerSection}
        />
        {guardSheet}
      </>
    );
  }

  return (
    <div
      role="region"
      aria-label="Single column layout"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
    >
      {heroSection}
      {draftSection}
      {ledgerSection}
      {toastNode}
      {guardSheet}
    </div>
  );
}
