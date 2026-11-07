import { useEffect, useState } from 'react';

export type LayoutMode = 'compact' | 'expanded';

/**
 * Anything at least this wide gets two panes. The unfolded iPhone Duo is 626 CSS px wide; the
 * threshold sits well below that so small differences in how a browser reports the width while
 * folding/unfolding can never push the unfolded screen back into one giant column.
 */
export const EXPANDED_BREAKPOINT_PX = 560;

/** Browsers can report a stale width for a moment after a fold, so we look again shortly after. */
const SETTLE_RECHECK_DELAYS_MS = [120, 400, 1000];

function currentWidth(): number {
  const viewportWidth = window.visualViewport?.width ?? 0;
  const documentWidth = document.documentElement.clientWidth;
  return Math.max(window.innerWidth, documentWidth, viewportWidth);
}

function computeLayoutMode(): LayoutMode {
  if (typeof window === 'undefined') {
    return 'compact';
  }
  return currentWidth() >= EXPANDED_BREAKPOINT_PX ? 'expanded' : 'compact';
}

export function useLayoutMode(): LayoutMode {
  const [mode, setMode] = useState<LayoutMode>(computeLayoutMode);

  useEffect(() => {
    const timers = new Set<number>();

    const update = () => {
      setMode(computeLayoutMode());
    };

    const updateAndRecheck = () => {
      update();
      for (const delay of SETTLE_RECHECK_DELAYS_MS) {
        const timer = window.setTimeout(() => {
          timers.delete(timer);
          update();
        }, delay);
        timers.add(timer);
      }
    };

    update();
    window.addEventListener('resize', updateAndRecheck);
    window.addEventListener('orientationchange', updateAndRecheck);
    window.addEventListener('pageshow', updateAndRecheck);
    window.addEventListener('focus', updateAndRecheck);
    document.addEventListener('visibilitychange', updateAndRecheck);
    window.visualViewport?.addEventListener('resize', updateAndRecheck);

    const mediaQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia(`(min-width: ${String(EXPANDED_BREAKPOINT_PX)}px)`)
        : null;

    if (mediaQuery && typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateAndRecheck);
    }

    return () => {
      window.removeEventListener('resize', updateAndRecheck);
      window.removeEventListener('orientationchange', updateAndRecheck);
      window.removeEventListener('pageshow', updateAndRecheck);
      window.removeEventListener('focus', updateAndRecheck);
      document.removeEventListener('visibilitychange', updateAndRecheck);
      window.visualViewport?.removeEventListener('resize', updateAndRecheck);
      if (mediaQuery && typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', updateAndRecheck);
      }
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  return mode;
}
