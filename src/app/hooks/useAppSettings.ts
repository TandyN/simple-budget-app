import { useEffect, useState } from 'react';
import { SimpleBudgetDatabase, type SettingsRecord } from '../../data/database';
import { getSettings } from '../../data/repositories';
import { createCryptoIdGenerator, createSystemClock } from '../providers';
import { openMonthsThrough, type AppDependencies } from '../use-cases';

let defaultDependencies: AppDependencies | null = null;

export function getDefaultAppDependencies(): AppDependencies {
  defaultDependencies ??= {
    db: new SimpleBudgetDatabase(),
    clock: createSystemClock(),
    ids: createCryptoIdGenerator(),
  };
  return defaultDependencies;
}

export interface AppSettingsState {
  readonly status: 'loading' | 'ready';
  readonly settings: SettingsRecord | null;
}

export function observeAppSettings(
  deps: AppDependencies,
  onState: (state: AppSettingsState) => void,
): () => void {
  let cancelled = false;

  const refresh = () => {
    void (async () => {
      const currentSettings = await deps.db.transaction('readonly', ['settings'], (tx) =>
        getSettings(tx),
      );
      if (currentSettings?.setupCompletedAt) {
        await openMonthsThrough(deps);
      }
      if (!cancelled) {
        onState({
          status: 'ready',
          settings: currentSettings,
        });
      }
    })();
  };

  refresh();
  const unsubscribe = deps.db.subscribe(refresh);

  return () => {
    cancelled = true;
    unsubscribe();
  };
}

export function useAppSettings(deps: AppDependencies): AppSettingsState {
  const [state, setState] = useState<AppSettingsState>({
    status: 'loading',
    settings: null,
  });

  useEffect(() => {
    return observeAppSettings(deps, setState);
  }, [deps]);

  return state;
}
