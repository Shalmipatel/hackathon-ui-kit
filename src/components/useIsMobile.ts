/**
 * useIsMobile hook
 *
 * Returns true when the viewport width is at or below the mobile breakpoint (768px).
 * Uses matchMedia for efficient updates without resize event polling.
 */

import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768;

export function useIsMobile(breakpoint = MOBILE_BREAKPOINT): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= breakpoint;
  });

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);

    // Set initial value from matchMedia (handles SSR hydration edge case)
    setIsMobile(mql.matches);

    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [breakpoint]);

  return isMobile;
}

export default useIsMobile;
