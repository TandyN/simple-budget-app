import { useEffect, useState } from 'react';

export interface PwaStatus {
  readonly isOffline: boolean;
  readonly isOfflineReady: boolean;
}

export function usePwaStatus(): PwaStatus {
  const [isOffline, setIsOffline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );
  const [isOfflineReady, setIsOfflineReady] = useState<boolean>(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
    };
    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

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
        .register('./sw.js')
        .then(() => navigator.serviceWorker.ready)
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
    };
  }, []);

  return { isOffline, isOfflineReady };
}
