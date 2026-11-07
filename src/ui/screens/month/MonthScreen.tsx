import { useState, type ReactNode } from 'react';
import type { MonthStatement } from '../../../domain/ledger';
import { AmountText, EmptyState, ListRow, TextField } from '../../components';
import { TwoPane, type LayoutMode } from '../../layout';

export interface MonthScreenProps {
  readonly statement: MonthStatement;
  readonly layoutMode: LayoutMode;
  readonly actionButtons: ReactNode;
}

function LedgerRowItem({
  title,
  subtitle,
  amount,
  sign,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly amount: MonthStatement['carriedOver'];
  readonly sign: 'auto' | 'always';
}) {
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

export function MonthScreen({ statement, layoutMode, actionButtons }: MonthScreenProps) {
  const [startingPointOpen, setStartingPointOpen] = useState(true);
  const [draftNote, setDraftNote] = useState('');

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
        <LedgerRowItem key={entry.id} title={entry.name} amount={entry.amount} sign="always" />
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
          {statement.activity.map((entry) => (
            <LedgerRowItem
              key={entry.id}
              title={entry.name}
              subtitle={entry.note || undefined}
              amount={entry.amount}
              sign="always"
            />
          ))}
        </div>
      )}
    </section>
  );

  if (layoutMode === 'expanded') {
    return (
      <TwoPane
        leftLabel="Overview pane"
        rightLabel="Ledger pane"
        left={
          <>
            {heroSection}
            {draftSection}
            {actionButtons}
          </>
        }
        right={ledgerSection}
      />
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
    </div>
  );
}
