import { useEffect, useState } from 'react';
import { formatLocalTime } from '../../../domain/instant';
import { entryInstant, type LedgerEntry, type MonthStatement } from '../../../domain/ledger';
import type { ManualEntryKind } from '../../../app/use-cases';
import { AmountText, EmptyState, IconButton, LeftArrowIcon, ListRow, RightArrowIcon, Toast } from '../../components';
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

export const ACTIVITY_PAGE_SIZE: Record<LayoutMode, number> = {
  compact: 5,
  expanded: 8,
};

export interface MonthScreenProps {
  readonly statement: MonthStatement;
  readonly layoutMode: LayoutMode;
  readonly onAddEntry: (kind: ManualEntryKind) => void;
  readonly onSelectEntry?: (entry: LedgerEntry) => void;
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
          <div style={{ minWidth: 0 }}>
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
  onAddEntry,
  onSelectEntry,
  deletedToast,
}: MonthScreenProps) {
  const pageSize = ACTIVITY_PAGE_SIZE[layoutMode];
  const [page, setPage] = useState(0);

  // The list is newest first and ends with the amount carried over from last month.
  const hasCarriedOver = statement.carriedOver !== 0;
  const totalRows = statement.activity.length + (hasCarriedOver ? 1 : 0);
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const currentPage = Math.min(page, pageCount - 1);

  useEffect(() => {
    if (page > pageCount - 1) {
      setPage(pageCount - 1);
    }
  }, [page, pageCount]);

  const firstRow = currentPage * pageSize;
  const entriesOnPage = statement.activity.slice(firstRow, firstRow + pageSize);
  const showCarriedOver =
    hasCarriedOver &&
    firstRow + entriesOnPage.length >= statement.activity.length &&
    entriesOnPage.length < pageSize;

  const heroSection = (
    <section className="sb-card sb-hero-card" aria-label="Available funds summary">
      <div className="sb-hero-row">
        <div style={{ minWidth: 0 }}>
          <p className="sb-hero-label">Available funds</p>
          <div data-current-budget="true">
            <AmountText amount={statement.currentBudget} variant="hero" />
          </div>
        </div>
        <div className="sb-quick-actions" role="toolbar" aria-label="Budget actions">
          <button
            type="button"
            className="sb-quick-action sb-quick-action-minus"
            aria-label="Add expense"
            onClick={() => {
              onAddEntry('expense');
            }}
          >
            <span aria-hidden="true">−</span>
          </button>
          <button
            type="button"
            className="sb-quick-action"
            aria-label="Add deposit"
            onClick={() => {
              onAddEntry('deposit');
            }}
          >
            <span aria-hidden="true">+</span>
          </button>
        </div>
      </div>
    </section>
  );

  const ledgerSection = (
    <section className="sb-card" aria-label="Month ledger">
      <h2 className="sb-section-heading">Activity</h2>
      {totalRows === 0 ? (
        <EmptyState title="No activity yet" />
      ) : (
        <div className="sb-list">
          {entriesOnPage.map((entry) => {
            const details = [formatShortDate(entry.date), formatLocalTime(entryInstant(entry))];
            if (entry.note) {
              details.push(entry.note);
            }
            return (
              <LedgerRowItem
                key={entry.id}
                title={entry.name}
                subtitle={details.join(' · ')}
                amount={entry.amount}
                sign="always"
                onClick={() => {
                  onSelectEntry?.(entry);
                }}
              />
            );
          })}
          {showCarriedOver ? (
            <LedgerRowItem
              title={statement.carriedOverLabel}
              amount={statement.carriedOver}
              sign="auto"
            />
          ) : null}
        </div>
      )}
      {pageCount > 1 ? (
        <nav className="sb-pager" aria-label="Activity pages">
          <IconButton
            label="Previous page"
            disabled={currentPage === 0}
            onClick={() => {
              setPage(currentPage - 1);
            }}
          >
            <LeftArrowIcon />
          </IconButton>
          <span>
            Page {currentPage + 1} of {pageCount}
          </span>
          <IconButton
            label="Next page"
            disabled={currentPage >= pageCount - 1}
            onClick={() => {
              setPage(currentPage + 1);
            }}
          >
            <RightArrowIcon />
          </IconButton>
        </nav>
      ) : null}
    </section>
  );

  const toastNode = deletedToast ? (
    <Toast message={deletedToast.message} actionLabel="Undo" onAction={deletedToast.onUndo} />
  ) : null;

  if (layoutMode === 'expanded') {
    return (
      <TwoPane
        left={
          <>
            {heroSection}
            {toastNode}
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
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
    >
      {heroSection}
      {ledgerSection}
      {toastNode}
    </div>
  );
}
