import { useEffect, useMemo, useRef, useState } from 'react';
import { monthKeyOf, monthLabel } from './domain/calendar';
import type { LedgerEntry } from './domain/ledger';
import { useAppSettings, getDefaultAppDependencies } from './app/hooks/useAppSettings';
import { useMonthView } from './app/hooks/useMonthView';
import {
  addEntry,
  completeSetup,
  deleteEntry,
  restoreEntry,
  updateEntry,
  type CompleteSetupInput,
  type ManualEntryKind,
} from './app/use-cases';
import { usePwaStatus } from './pwa/register-sw';
import { Button, EmptyState } from './ui/components';
import { AppShell, useHashRoute, useLayoutMode } from './ui/layout';
import { EntrySheet, type EntrySheetSubmitValue } from './ui/screens/month/EntrySheet';
import { MonthScreen } from './ui/screens/month/MonthScreen';
import { SetupScreen } from './ui/screens/setup/SetupScreen';

interface SheetState {
  readonly open: boolean;
  readonly mode: 'add' | 'edit';
  readonly kind: ManualEntryKind;
  readonly entry: LedgerEntry | null;
}

export function App() {
  const deps = useMemo(() => getDefaultAppDependencies(), []);
  const { status, settings } = useAppSettings(deps);
  const { isOffline, isOfflineReady } = usePwaStatus();
  const layoutMode = useLayoutMode();
  const [route, navigate] = useHashRoute();

  const [sheetState, setSheetState] = useState<SheetState>({
    open: false,
    mode: 'add',
    kind: 'expense',
    entry: null,
  });
  const [deletedEntry, setDeletedEntry] = useState<LedgerEntry | null>(null);
  const undoTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current !== null) {
        window.clearTimeout(undoTimerRef.current);
      }
    };
  }, []);

  const today = deps.clock.today();
  const currentMonth = monthKeyOf(today);
  const currentMonthTitle = monthLabel(currentMonth);
  const statement = useMonthView(deps.db, currentMonth);
  const isSetupCompleted = Boolean(settings?.setupCompletedAt);

  const handleCompleteSetup = async (input: CompleteSetupInput) => {
    await completeSetup(deps, input);
    navigate('budget');
  };

  const openAddSheet = (kind: ManualEntryKind) => {
    setSheetState({
      open: true,
      mode: 'add',
      kind,
      entry: null,
    });
  };

  const openEditSheet = (entry: LedgerEntry) => {
    setSheetState({
      open: true,
      mode: 'edit',
      kind: entry.amount < 0 ? 'expense' : 'deposit',
      entry,
    });
  };

  const closeSheet = () => {
    setSheetState((prev) => ({
      ...prev,
      open: false,
    }));
  };

  const handleSaveEntry = async (value: EntrySheetSubmitValue) => {
    if (sheetState.mode === 'edit' && sheetState.entry) {
      await updateEntry(deps, {
        id: sheetState.entry.id,
        amount: value.amount,
        name: value.name,
        date: value.date,
        note: value.note,
      });
    } else {
      await addEntry(deps, {
        kind: value.kind,
        amount: value.amount,
        name: value.name,
        date: value.date,
        note: value.note,
      });
    }
    closeSheet();
  };

  const handleDeleteCurrentEntry = async () => {
    if (!sheetState.entry) {
      return;
    }
    const removed = await deleteEntry(deps, sheetState.entry.id);
    closeSheet();
    setDeletedEntry(removed);
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current);
    }
    undoTimerRef.current = window.setTimeout(() => {
      setDeletedEntry(null);
      undoTimerRef.current = null;
    }, 5000);
  };

  const handleUndoDelete = () => {
    if (!deletedEntry) {
      return;
    }
    const entryToRestore = deletedEntry;
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setDeletedEntry(null);
    void restoreEntry(deps, entryToRestore);
  };

  const actionButtons = (
    <div
      className={layoutMode === 'compact' ? 'sb-action-bar sb-action-bar-bottom' : 'sb-action-bar'}
      role="toolbar"
      aria-label="Budget actions"
    >
      <Button
        variant="primary"
        onClick={() => {
          openAddSheet('expense');
        }}
      >
        Add expense
      </Button>
      <Button
        variant="secondary"
        onClick={() => {
          openAddSheet('deposit');
        }}
      >
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

  const deletedToast = deletedEntry
    ? {
        message: `${deletedEntry.amount < 0 ? 'Expense' : 'Deposit'} deleted`,
        onUndo: handleUndoDelete,
      }
    : null;

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
        <>
          <MonthScreen
            statement={statement}
            layoutMode={layoutMode}
            actionButtons={actionButtons}
            onSelectEntry={openEditSheet}
            onNavigateToSettings={() => {
              navigate('settings');
            }}
            deletedToast={deletedToast}
          />
          <EntrySheet
            open={sheetState.open}
            mode={sheetState.mode}
            kind={sheetState.kind}
            initialEntry={sheetState.entry}
            defaultDate={today}
            layoutMode={layoutMode}
            onClose={closeSheet}
            onSave={handleSaveEntry}
            onDelete={sheetState.mode === 'edit' ? handleDeleteCurrentEntry : undefined}
          />
        </>
      ) : null}
    </AppShell>
  );
}
