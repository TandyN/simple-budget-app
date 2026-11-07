import type { ReactNode } from 'react';
import { BackArrowIcon, Button, IconButton, InsightsIcon, SettingsIcon } from '../components';
import { DebugOverlays } from './DebugOverlays';
import type { AppRoute } from './router';
import type { LayoutMode } from './useLayoutMode';

export interface AppShellProps {
  readonly monthTitle: string;
  readonly route: AppRoute;
  readonly onNavigate: (route: AppRoute) => void;
  readonly layoutMode: LayoutMode;
  readonly statusFooter: ReactNode;
  readonly bottomBar?: ReactNode;
  readonly children: ReactNode;
}

export function AppShell({
  monthTitle,
  route,
  onNavigate,
  layoutMode,
  statusFooter,
  bottomBar,
  children,
}: AppShellProps) {
  return (
    <div className="sb-shell" data-layout-mode={layoutMode}>
      <DebugOverlays layoutMode={layoutMode} />

      <header className="sb-header">
        <div className="sb-header-title-group">
          {route !== 'budget' ? (
            <IconButton
              label="Back to budget"
              onClick={() => {
                onNavigate('budget');
              }}
            >
              <BackArrowIcon />
            </IconButton>
          ) : null}
          <h1 className="sb-header-brand">Simple Budget</h1>
          <span className="sb-header-subtitle">{monthTitle}</span>
        </div>

        <nav className="sb-header-nav" aria-label="Primary navigation">
          {route !== 'budget' ? (
            <Button
              variant="quiet"
              onClick={() => {
                onNavigate('budget');
              }}
            >
              Budget
            </Button>
          ) : null}
          <IconButton
            label="Insights"
            aria-current={route === 'insights' ? 'page' : undefined}
            onClick={() => {
              onNavigate(route === 'insights' ? 'budget' : 'insights');
            }}
          >
            <InsightsIcon />
          </IconButton>
          <IconButton
            label="Settings"
            aria-current={route === 'settings' ? 'page' : undefined}
            onClick={() => {
              onNavigate(route === 'settings' ? 'budget' : 'settings');
            }}
          >
            <SettingsIcon />
          </IconButton>
        </nav>
      </header>

      <main className="sb-main">{children}</main>

      {layoutMode === 'compact' && bottomBar ? bottomBar : null}

      <footer className="sb-status-bar">{statusFooter}</footer>
    </div>
  );
}
