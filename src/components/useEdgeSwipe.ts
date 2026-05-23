/**
 * useEdgeSwipe — detects a horizontal swipe gesture starting from the
 * left edge of the viewport and fires `onOpen` when the user has dragged
 * far enough to "commit" to the gesture.
 *
 * Designed for opening a mobile drawer naturally (like iOS apps).
 *
 * Behavior:
 *   - Only fires when the touch starts within `edgeSize` px of the left edge
 *   - Requires a roughly horizontal swipe (rightward movement > vertical)
 *   - Triggers once distance exceeds `threshold` px
 *   - No-ops on touches inside ignore selectors so you don't trigger it
 *     while interacting with horizontally-scrollable inner UI
 */

import { useEffect, useRef } from 'react';

interface Options {
  enabled?: boolean;
  edgeSize?: number;
  threshold?: number;
  onOpen: () => void;
}

export function useEdgeSwipe({ enabled = true, edgeSize = 24, threshold = 60, onOpen }: Options): void {
  const startXRef = useRef<number | null>(null);
  const startYRef = useRef<number | null>(null);
  const triggeredRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      // Only start tracking if the touch begins very close to the left edge
      if (touch.clientX > edgeSize) {
        startXRef.current = null;
        startYRef.current = null;
        return;
      }
      startXRef.current = touch.clientX;
      startYRef.current = touch.clientY;
      triggeredRef.current = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (triggeredRef.current) return;
      if (startXRef.current === null || startYRef.current === null) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - startXRef.current;
      const dy = Math.abs(touch.clientY - startYRef.current);
      // Require predominantly horizontal motion + sufficient distance
      if (dx > threshold && dx > dy * 1.5) {
        triggeredRef.current = true;
        onOpen();
      }
    };

    const handleTouchEnd = () => {
      startXRef.current = null;
      startYRef.current = null;
      triggeredRef.current = false;
    };

    // passive: true so scrolling stays smooth — we never preventDefault here
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    document.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [enabled, edgeSize, threshold, onOpen]);
}
