import { useCallback, useEffect, useRef, useState } from 'react';
import { keyframes } from 'styled-components';

export const backdropFadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

export const backdropFadeOut = keyframes`
  from { opacity: 1; }
  to { opacity: 0; }
`;

export const modalScaleIn = keyframes`
  from { transform: translateY(8px) scale(0.98); opacity: 0; }
  to { transform: translateY(0) scale(1); opacity: 1; }
`;

export const modalScaleOut = keyframes`
  from { transform: translateY(0) scale(1); opacity: 1; }
  to { transform: translateY(8px) scale(0.98); opacity: 0; }
`;

export const MODAL_BACKDROP_DURATION = '0.2s';
export const MODAL_SURFACE_DURATION = '0.18s';
export const MODAL_CLOSE_MS = 200;

interface UseModalCloseOptions {
  lockScroll?: boolean;
  closeOnEsc?: boolean;
  durationMs?: number;
}

export function useModalClose(onClose: () => void, opts: UseModalCloseOptions = {}) {
  const { lockScroll = true, closeOnEsc = true, durationMs = MODAL_CLOSE_MS } = opts;
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);

  const startClose = useCallback(
    (after: () => void) => {
      if (closingRef.current) return;
      closingRef.current = true;
      setClosing(true);
      setTimeout(() => {
        after();
        closingRef.current = false;
        setClosing(false);
      }, durationMs);
    },
    [durationMs],
  );

  const requestClose = useCallback(() => {
    startClose(onClose);
  }, [startClose, onClose]);

  useEffect(() => {
    if (!closeOnEsc) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [requestClose, closeOnEsc]);

  useEffect(() => {
    if (!lockScroll) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [lockScroll]);

  return { closing, requestClose, startClose };
}
