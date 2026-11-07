import { useEffect, useState } from 'react';
import type { LayoutMode } from './useLayoutMode';

export interface DebugOverlaysProps {
  readonly layoutMode: LayoutMode;
}

export function DebugOverlays({ layoutMode }: DebugOverlaysProps) {
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
    dpr: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
  }));

  const search = typeof window !== 'undefined' ? window.location.search : '';
  const params = new URLSearchParams(search);
  const debugValues = params.getAll('debug');
  const showLayoutOverlay = debugValues.includes('layout');
  const showConsoleOverlay = debugValues.includes('console') && import.meta.env.DEV;

  useEffect(() => {
    if (!showLayoutOverlay) {
      return;
    }
    const handleResize = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
        dpr: window.devicePixelRatio,
      });
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [showLayoutOverlay]);

  if (!showLayoutOverlay && !showConsoleOverlay) {
    return null;
  }

  const isStandalone =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;

  const hasTwoSegments =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(horizontal-viewport-segments: 2)').matches;

  return (
    <>
      {showLayoutOverlay ? (
        <aside role="region" aria-label="Debug layout overlay" className="sb-debug-layout">
          <div>
            Viewport: {String(viewport.width)}×{String(viewport.height)} @{String(viewport.dpr)}x
          </div>
          <div>Layout mode: {layoutMode}</div>
          <div>
            Standalone: {isStandalone ? 'yes' : 'no'} · Segments: {hasTwoSegments ? '2' : '1'}
          </div>
        </aside>
      ) : null}
      {showConsoleOverlay ? (
        <aside
          role="region"
          aria-label="Debug console overlay"
          style={{
            position: 'fixed',
            right: '8px',
            bottom: '8px',
            zIndex: 9998,
            padding: '6px 10px',
            borderRadius: '8px',
            background: 'rgba(17, 17, 17, 0.88)',
            color: '#f4f4f5',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: '11px',
          }}
        >
          Dev console active
        </aside>
      ) : null}
    </>
  );
}
