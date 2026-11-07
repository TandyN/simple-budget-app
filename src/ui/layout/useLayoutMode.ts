import { useEffect, useState } from 'react';

export type LayoutMode = 'compact' | 'expanded';

export const EXPANDED_BREAKPOINT_PX = 600;

function computeLayoutMode(): LayoutMode {
  if (typeof window === 'undefined') {
    return 'compact';
  }
  return window.innerWidth >= EXPANDED_BREAKPOINT_PX ? 'expanded' : 'compact';
}

export function useLayoutMode(): LayoutMode {
  const [mode, setMode] = useState<LayoutMode>(computeLayoutMode);

  useEffect(() => {
    const update = () => {
      setMode(computeLayoutMode());
    };

    update();
    window.addEventListener('resize', update);

    const mediaQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia(`(min-width: ${String(EXPANDED_BREAKPOINT_PX)}px)`)
        : null;

    if (mediaQuery && typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', update);
    }

    return () => {
      window.removeEventListener('resize', update);
      if (mediaQuery && typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', update);
      }
    };
  }, []);

  return mode;
}
