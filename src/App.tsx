import { useState } from 'react';
import { cents } from './domain/money';
import { usePwaStatus } from './pwa/register-sw';
import { AmountText, Button, EmptyState, ListRow, TextField } from './ui/components';
import { AppShell, TwoPane, useHashRoute, useLayoutMode } from './ui/layout';

const SAMPLE_CURRENT_BUDGET = cents(308000);
const SAMPLE_CARRIED_OVER = cents(0);
const SAMPLE_INCOME = cents(500000);
const SAMPLE_RENT = cents(-180000);
const SAMPLE_GROCERIES = cents(-12000);

export function App() {
  const { isOffline, isOfflineReady } = usePwaStatus();
  const layoutMode = useLayoutMode();
  const [route, navigate] = useHashRoute();
  const [draftNote, setDraftNote] = useState('');

  const heroSection = (
    <section className="sb-card" aria-label="Current budget summary">
      <p className="sb-hero-label">Current budget</p>
      <AmountText amount={SAMPLE_CURRENT_BUDGET} variant="hero" />
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

  const ledgerSection = (
    <section className="sb-card" aria-label="Month ledger">
      <h2 className="sb-section-heading">Starting point</h2>
      <div className="sb-list">
        <ListRow
          title="Carried over from October"
          trailing={<AmountText amount={SAMPLE_CARRIED_OVER} sign="auto" />}
        />
        <ListRow
          title="Monthly income"
          trailing={<AmountText amount={SAMPLE_INCOME} sign="always" />}
        />
        <ListRow title="Rent" trailing={<AmountText amount={SAMPLE_RENT} sign="always" />} />
      </div>

      <h2 className="sb-section-heading" style={{ marginTop: 'var(--space-5)' }}>
        Activity
      </h2>
      <div className="sb-list">
        <ListRow
          title="Groceries"
          subtitle="Nov 5"
          trailing={<AmountText amount={SAMPLE_GROCERIES} sign="always" />}
        />
      </div>
    </section>
  );

  const actionButtons = (
    <div
      className={layoutMode === 'compact' ? 'sb-action-bar sb-action-bar-bottom' : 'sb-action-bar'}
      role="toolbar"
      aria-label="Budget actions"
    >
      <Button variant="primary">Add expense</Button>
      <Button variant="secondary">Add deposit</Button>
    </div>
  );

  const statusFooter = (
    <p
      role="status"
      aria-label="App status"
      style={{
        margin: 0,
        display: 'flex',
        gap: '12px',
        alignItems: 'center',
      }}
    >
      <span>Version v{__APP_VERSION__}</span>
      <span>•</span>
      <span>
        {isOffline ? 'Working offline' : isOfflineReady ? 'Offline ready' : 'Local storage active'}
      </span>
    </p>
  );

  return (
    <AppShell
      monthTitle="November 2026"
      route={route}
      onNavigate={navigate}
      layoutMode={layoutMode}
      statusFooter={statusFooter}
      bottomBar={route === 'budget' ? actionButtons : undefined}
    >
      {route === 'insights' ? (
        <section className="sb-card" aria-labelledby="insights-heading">
          <h2 id="insights-heading" style={{ margin: '0 0 var(--space-2) 0' }}>
            Insights
          </h2>
          <EmptyState
            title="Spending by tag"
            description="Tag breakdown and monthly spending trends will appear here."
          />
        </section>
      ) : route === 'settings' ? (
        <section className="sb-card" aria-labelledby="settings-heading">
          <h2 id="settings-heading" style={{ margin: '0 0 var(--space-2) 0' }}>
            Settings
          </h2>
          <EmptyState
            title="Budget plan & backups"
            description="Configure your monthly income, recurring expenses, and local JSON backups."
          />
        </section>
      ) : layoutMode === 'expanded' ? (
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
      ) : (
        <div
          role="region"
          aria-label="Single column layout"
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
        >
          {heroSection}
          {draftSection}
          {ledgerSection}
        </div>
      )}
    </AppShell>
  );
}
