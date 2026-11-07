import { useEffect, useState } from 'react';

export interface PwaStatus {
  readonly isOffline: boolean;
  readonly isOfflineReady: boolean;
}

const ASSET_RECOVERY_KEY = 'simple-budget-asset-reload';

async function recoverFromStaleAssetError(): Promise<void> {
  try {
    if (sessionStorage.getItem(ASSET_RECOVERY_KEY) === '1') {
      return;
    }
    sessionStorage.setItem(ASSET_RECOVERY_KEY, '1');
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith('simple-budget-')).map((key) => caches.delete(key)),
      );
    }
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    window.location.reload();
  } catch {
    // Ignore storage/service-worker errors in restricted contexts
  }
}

export function usePwaStatus(): PwaStatus {
  const [isOffline, setIsOffline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );
  const [isOfflineReady, setIsOfflineReady] = useState<boolean>(false);

  useEffect(() => {
    try {
      sessionStorage.removeItem(ASSET_RECOVERY_KEY);
    } catch {
      // Ignore sessionStorage errors in restricted contexts
    }

    const handleOnline = () => {
      setIsOffline(false);
    };
    const handleOffline = () => {
      setIsOffline(true);
    };
    const handlePreloadError = () => {
      void recoverFromStaleAssetError();
    };
    const handleResourceError = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLScriptElement || target instanceof HTMLLinkElement) {
        void recoverFromStaleAssetError();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('vite:preloadError', handlePreloadError);
    window.addEventListener('error', handleResourceError, true);

    if ('serviceWorker' in navigator && !window.location.search.includes('nosw=1')) {
      const markReadyWhenControlled = () => {
        if (navigator.serviceWorker.controller) {
          setIsOfflineReady(true);
          return;
        }
        navigator.serviceWorker.addEventListener(
          'controllerchange',
          () => {
            setIsOfflineReady(true);
          },
          { once: true },
        );
      };

      void navigator.serviceWorker
        .register('./sw.js', { updateViaCache: 'none' })
        .then((registration) => {
          void registration.update().catch(() => undefined);
          return navigator.serviceWorker.ready;
        })
        .then(() => {
          markReadyWhenControlled();
        })
        .catch(() => {
          // Service worker registration is best-effort in dev/unsupported contexts
        });
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('vite:preloadError', handlePreloadError);
      window.removeEventListener('error', handleResourceError, true);
    };
  }, []);

  return { isOffline, isOfflineReady };
}
