/**
 * BottomSheet Component
 *
 * Mobile-first pull-up sheet overlay for menus, file panels, etc.
 * Replaces dropdown menus and popups on mobile viewports.
 *
 * Design reference: Figma 223:14175, 223:15321
 *   - Dark background (#242424), rounded top corners (24px)
 *   - Gray handle bar at top center
 *   - Title + close button header
 *   - Scrollable content area
 *   - Semi-transparent backdrop
 *   - Slide-up / slide-down animation
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styled, { keyframes, css } from 'styled-components';

/* ── Animations ── */

const backdropFadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const backdropFadeOut = keyframes`
  from { opacity: 1; }
  to { opacity: 0; }
`;

const sheetSlideUp = keyframes`
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
`;

const sheetSlideDown = keyframes`
  from { transform: translateY(0); }
  to { transform: translateY(100%); }
`;

/* ── Styled Components ── */

const Backdrop = styled.div<{ $closing?: boolean }>`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 10000;
  animation: ${(p) => (p.$closing ? backdropFadeOut : backdropFadeIn)} 0.3s ease forwards;
`;

const SheetContainer = styled.div<{ $closing?: boolean; $maxHeight?: string; $height?: string }>`
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 10001;
  background: #242424;
  border-radius: 24px 24px 0 0;
  display: flex;
  flex-direction: column;
  max-height: ${(p) => p.$maxHeight || '70vh'};
  ${(p) => p.$height && `height: ${p.$height};`}
  /* Pad the bottom by the iOS home-indicator safe area so content
     inside the sheet doesn't sit under the home bar. */
  padding-bottom: env(safe-area-inset-bottom, 0);
  animation: ${(p) => (p.$closing ? sheetSlideDown : sheetSlideUp)} 0.3s ease forwards;
`;

const HandleBar = styled.div`
  display: flex;
  justify-content: center;
  padding: 12px 0 0;
  flex-shrink: 0;
`;

const Handle = styled.div`
  width: 40px;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.3);
`;

const SheetHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 12px;
  flex-shrink: 0;
`;

const SheetTitle = styled.span`
  font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
  letter-spacing: -0.3px;
`;

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: background 0.15s;
  padding: 0;

  &:hover {
    background: rgba(255, 255, 255, 0.2);
  }
`;

const SheetBody = styled.div`
  flex: 1;
  overflow-y: auto;
  min-height: 0;

  &::-webkit-scrollbar {
    width: 4px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 2px;
  }
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
`;

/* ── Close Icon ── */

const CloseSvg: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

/* ── Component ── */

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Max height of the sheet, default '70vh' */
  maxHeight?: string;
  /** Fixed height of the sheet (e.g. '60vh'). When set, sheet always fills this height. */
  height?: string;
  children: React.ReactNode;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  open,
  onClose,
  title,
  maxHeight,
  height,
  children,
}) => {
  const [closing, setClosing] = React.useState(false);
  const closingRef = useRef(false);

  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      closingRef.current = false;
      onClose();
    }, 280);
  }, [onClose]);

  // Prevent body scroll when sheet is open
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, handleClose]);

  if (!open && !closing) return null;

  return createPortal(
    <>
      <Backdrop $closing={closing} onClick={handleClose} />
      <SheetContainer $closing={closing} $maxHeight={maxHeight} $height={height}>
        <HandleBar>
          <Handle />
        </HandleBar>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <CloseButton onClick={handleClose} aria-label="Close">
            <CloseSvg />
          </CloseButton>
        </SheetHeader>
        <SheetBody>{children}</SheetBody>
      </SheetContainer>
    </>,
    document.body,
  );
};

export default BottomSheet;
