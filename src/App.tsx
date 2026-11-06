import { usePwaStatus } from './pwa/register-sw';

export function App() {
  const { isOffline, isOfflineReady } = usePwaStatus();

  return (
    <main
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
        padding: '24px',
        color: '#111111',
      }}
    >
      <h1>Simple Budget</h1>
      <p
        role="status"
        aria-label="App status"
        style={{
          marginTop: '16px',
          fontSize: '13px',
          color: '#6B6B70',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
        }}
      >
        <span>Version v{__APP_VERSION__}</span>
        <span>•</span>
        <span>
          {isOffline
            ? 'Working offline'
            : isOfflineReady
              ? 'Offline ready'
              : 'Local storage active'}
        </span>
      </p>
    </main>
  );
}
