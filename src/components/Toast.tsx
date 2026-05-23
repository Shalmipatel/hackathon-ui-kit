import React from 'react';
import styled, { keyframes } from 'styled-components';
import { theme } from '@/components/theme';

const toastSlideIn = keyframes`
  from {
    opacity: 0;
    transform: translate(-50%, 8px);
  }
  to {
    opacity: 1;
    transform: translate(-50%, 0);
  }
`;

const toastSlideOut = keyframes`
  from {
    opacity: 1;
    transform: translate(-50%, 0);
  }
  to {
    opacity: 0;
    transform: translate(-50%, 8px);
  }
`;

export type ToastVariant = 'error' | 'success';

const variantColors = {
  error: { background: theme.colors.errorBg, foreground: theme.colors.error },
  success: { background: theme.colors.successBg, foreground: theme.colors.success },
} as const;

const ToastBar = styled.div<{ $fading: boolean; $variant: ToastVariant }>`
  position: absolute;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: ${(p) => variantColors[p.$variant].background};
  border: 1px solid ${(p) => variantColors[p.$variant].foreground};
  border-radius: ${theme.borderRadius.sm};
  font-size: 13px;
  font-family: ${theme.fontFamily};
  color: ${(p) => variantColors[p.$variant].foreground};
  box-shadow: ${theme.shadows.md};
  white-space: nowrap;
  animation: ${(p) => (p.$fading ? toastSlideOut : toastSlideIn)} 0.25s
    ${(p) => (p.$fading ? 'ease-in' : 'ease-out')} forwards;
  pointer-events: auto;
`;

const ToastMessage = styled.span`
  flex: 1;
  min-width: 0;
`;

const ToastDismiss = styled.button<{ $variant: ToastVariant }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: ${(p) => variantColors[p.$variant].foreground};
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  opacity: 0.6;
  transition: opacity 0.15s;

  &:hover {
    opacity: 1;
  }
`;

interface ToastProps {
  message: string | null;
  fading: boolean;
  onDismiss: () => void;
  variant?: ToastVariant;
}

export const Toast: React.FC<ToastProps> = ({ message, fading, onDismiss, variant = 'error' }) => {
  if (!message) return null;

  return (
    <ToastBar $fading={fading} $variant={variant} role="alert">
      <ToastMessage>{message}</ToastMessage>
      <ToastDismiss $variant={variant} onClick={onDismiss} aria-label="Dismiss">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </ToastDismiss>
    </ToastBar>
  );
};
