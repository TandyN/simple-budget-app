import { useMemo } from 'react';
import { monthKeyOf, monthLabel } from './domain/calendar';
import { useAppSettings, getDefaultAppDependencies } from './app/hooks/useAppSettings';
import { useMonthView } from './app/hooks/useMonthView';
import { completeSetup, type CompleteSetupInput } from './app/use-cases';
import { usePwaStatus } from './pwa/register-sw';
import { Button, EmptyState } from './ui/components';
import { AppShell, useHashRoute, useLayoutMode } from './ui/layout';
import { MonthScreen } from './ui/screens/month/MonthScreen';
import { SetupScreen } from './ui/screens/setup/SetupScreen';

export function App() {
  const deps = useMemo(() => getDefaultAppDependencies(), []);
  const { status, settings } = useAppSettings(deps);
  const { isOffline, isOfflineReady } = usePwaStatus();
  const layoutMode = useLayoutMode();
  const [route, navigate] = useHashRoute();

  const currentMonth = monthKeyOf(deps.clock.today());
  const currentMonthTitle = monthLabel(currentMonth);
  const statement = useMonthView(deps.db, currentMonth);
  const isSetupCompleted = Boolean(settings?.setupCompletedAt);

  const handleCompleteSetup = async (input: CompleteSetupInput) => {
    await completeSetup(deps, input);
    navigate('budget');
  };

  const actionButtons = (
    <div
      className={layoutMode === 'compact' ? 'sb-action-bar sb-action-bar-bottom' : 'sb-action-bar'}
      role="toolbar"
      aria-label="Budget actions"
    >
      <Button variant="primary" disabled>
        Add expense
      </Button>
      <Button variant="secondary" disabled>
        Add deposit
      </Button>
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
      monthTitle={isSetupCompleted ? currentMonthTitle : 'Set up your budget'}
      route={route}
      onNavigate={navigate}
      layoutMode={layoutMode}
      statusFooter={statusFooter}
      bottomBar={isSetupCompleted && route === 'budget' ? actionButtons : undefined}
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
      ) : status === 'loading' ? (
        <section className="sb-card" aria-label="Loading budget">
          <p style={{ margin: 0, color: 'var(--color-ink-muted)' }}>Loading your budget…</p>
        </section>
      ) : !isSetupCompleted ? (
        <SetupScreen layoutMode={layoutMode} onCompleteSetup={handleCompleteSetup} />
      ) : statement ? (
        <MonthScreen statement={statement} layoutMode={layoutMode} actionButtons={actionButtons} />
      ) : null}
    </AppShell>
  );
}
