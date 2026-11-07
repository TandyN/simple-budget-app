import { useCallback, useEffect, useState } from 'react';

export type AppRoute = 'budget' | 'insights' | 'settings';

export function parseHashRoute(hash: string): AppRoute {
  const normalized = hash.replace(/^#\/?/, '').trim().toLowerCase();
  if (normalized === 'insights') {
    return 'insights';
  }
  if (normalized === 'settings') {
    return 'settings';
  }
  return 'budget';
}

export function routeToHash(route: AppRoute): string {
  if (route === 'insights') {
    return '#/insights';
  }
  if (route === 'settings') {
    return '#/settings';
  }
  return '#/';
}

export function useHashRoute(): readonly [AppRoute, (nextRoute: AppRoute) => void] {
  const [route, setRoute] = useState<AppRoute>(() =>
    typeof window !== 'undefined' ? parseHashRoute(window.location.hash) : 'budget',
  );

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(parseHashRoute(window.location.hash));
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  const navigate = useCallback((nextRoute: AppRoute) => {
    const targetHash = routeToHash(nextRoute);
    if (typeof window !== 'undefined' && window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }
    setRoute(nextRoute);
  }, []);

  return [route, navigate] as const;
}
