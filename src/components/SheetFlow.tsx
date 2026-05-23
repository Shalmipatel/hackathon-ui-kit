import React, { useCallback, useEffect, useRef, useState } from 'react';
import styled, { css, keyframes } from 'styled-components';
export const sheetTokens = {
  background: '#FBFAF9',
  textPrimary: '#242424',
  textSecondary: 'rgba(36, 36, 36, 0.75)',
  inputBorder: 'rgba(36, 36, 36, 0.1)',
  surfaceMuted: 'rgba(36, 36, 36, 0.05)',
  brandYellow: '#FEEB29',
  brandYellowHover: '#FDE614',
  brandYellowActive: '#F4D900',
  danger: '#DC2626',
} as const;

export type SheetStepDirection = 'forward' | 'backward';

export interface SheetFlowProps {
  /** Accessible label announced to screen readers. */
  ariaLabel: string;
  /** Tap handler for the top-right close icon. */
  onClose: () => void;
  /**
   * If provided, a chevron-left back button is shown on the left. If
   * omitted, a 32×32 spacer keeps the close icon right-aligned.
   */
  onBack?: () => void;
  /** Identifier of the currently-rendered step. Changes trigger slides. */
  currentStepKey: string;
  /**
   * Direction of the transition when `currentStepKey` changes. Defaults
   * to `forward` (new step slides in from the right).
   */
  direction?: SheetStepDirection;
  /** Renders the content for a given step key. Called for both the
   *  incoming and outgoing steps during a transition. */
  renderStep: (stepKey: string) => React.ReactNode;
}

/**
 * Convenience hook for consumers that want a single source of truth
 * for (currentStep, direction). Not required — consumers can hold the
 * pair in their own state if they prefer.
 */
export function useSheetStepState<S extends string>(initial: S) {
  const [step, setStep] = useState<S>(initial);
  const [direction, setDirection] = useState<SheetStepDirection>('forward');
  const go = useCallback((next: S, dir: SheetStepDirection = 'forward') => {
    setStep((prev) => {
      if (prev === next) return prev;
      setDirection(dir);
      return next;
    });
  }, []);
  return { step, direction, go } as const;
}


const STEP_TRANSITION_MS = 280;
const SHEET_SLIDE_MS = 320;

const slideUp = keyframes`
  from { transform: translateY(100%); }
  to   { transform: translateY(0);     }
`;

const SheetRoot = styled.div`
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: ${sheetTokens.background};
  height: 100vh;
  height: 100dvh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  animation: ${slideUp} ${SHEET_SLIDE_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  overflow: hidden;
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  flex-shrink: 0;
`;

const IconButton = styled.button`
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: ${sheetTokens.textPrimary};
  border-radius: 999px;
  cursor: pointer;
  padding: 0;
  -webkit-tap-highlight-color: transparent;

  &:hover { background: rgba(36, 36, 36, 0.06); }
  &:active { background: rgba(36, 36, 36, 0.1); }

  & > svg { display: block; }
`;

const IconButtonSpacer = styled.div`
  width: 32px;
  height: 32px;
`;

const StepStage = styled.div`
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
`;

const stepSlideTransition = css`
  transition: transform ${STEP_TRANSITION_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1);
`;

const StepPanel = styled.div<{
  $phase: 'enter' | 'exit';
  $direction: SheetStepDirection;
}>`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  padding: 8px 16px 24px;
  box-sizing: border-box;
  ${stepSlideTransition};

  /*
   * Resting transform (unsettled):
   *   enter forward  → translateX(+100%) then animate to 0
   *   enter backward → translateX(-100%) then animate to 0
   *   exit  forward  → translateX(0) then animate to -100%
   *   exit  backward → translateX(0) then animate to +100%
   */
  transform: ${(p) =>
    p.$phase === 'enter'
      ? p.$direction === 'forward'
        ? 'translateX(100%)'
        : 'translateX(-100%)'
      : 'translateX(0)'};

  &[data-settled='true'] {
    transform: ${(p) =>
      p.$phase === 'enter'
        ? 'translateX(0)'
        : p.$direction === 'forward'
          ? 'translateX(-100%)'
          : 'translateX(100%)'};
  }
`;

/* ══════════════════════════════════════════════════════════════
   Inline icons
   ══════════════════════════════════════════════════════════════ */

const CloseIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const ChevronLeftIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const SheetCopyIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
    <path d="M4 16V6a2 2 0 0 1 2-2h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

/* ══════════════════════════════════════════════════════════════
   Component — the shell
   ══════════════════════════════════════════════════════════════ */

const SheetFlow: React.FC<SheetFlowProps> = ({
  ariaLabel,
  onClose,
  onBack,
  currentStepKey,
  direction = 'forward',
  renderStep,
}) => {
  /*
   * Track the previous step so we can render it briefly as an
   * "exiting" panel during the transition. `enterSettled` flips true
   * on the double-rAF after mount so the entering panel's initial
   * transform is committed before we animate to its resting state.
   */
  const prevStepRef = useRef(currentStepKey);
  const [exitingStepKey, setExitingStepKey] = useState<string | null>(null);
  const [enterSettled, setEnterSettled] = useState(true);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (prevStepRef.current === currentStepKey) return;

    const from = prevStepRef.current;
    prevStepRef.current = currentStepKey;
    setExitingStepKey(from);
    setEnterSettled(false);

    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    exitTimerRef.current = setTimeout(
      () => setExitingStepKey(null),
      STEP_TRANSITION_MS + 40,
    );

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => setEnterSettled(true));
    });
  }, [currentStepKey]);

  useEffect(
    () => () => {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  return (
    <SheetRoot role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <Header>
        {onBack ? (
          <IconButton onClick={onBack} aria-label="Back">
            <ChevronLeftIcon />
          </IconButton>
        ) : (
          <IconButtonSpacer aria-hidden="true" />
        )}
        <IconButton onClick={onClose} aria-label="Close">
          <CloseIcon />
        </IconButton>
      </Header>

      <StepStage>
        {exitingStepKey && exitingStepKey !== currentStepKey && (
          <StepPanel
            key={`exit-${exitingStepKey}`}
            $phase="exit"
            $direction={direction}
            data-settled="true"
          >
            {renderStep(exitingStepKey)}
          </StepPanel>
        )}
        <StepPanel
          key={`enter-${currentStepKey}`}
          $phase="enter"
          $direction={direction}
          data-settled={enterSettled ? 'true' : 'false'}
        >
          {renderStep(currentStepKey)}
        </StepPanel>
      </StepStage>
    </SheetRoot>
  );
};

export default SheetFlow;

/* ══════════════════════════════════════════════════════════════
   Shared styled primitives for step bodies
   ══════════════════════════════════════════════════════════════ */

export const SheetTitle = styled.h2`
  font-family: 'Inter', sans-serif;
  font-weight: 600;
  font-size: 15px;
  line-height: 24px;
  letter-spacing: -0.3px;
  color: ${sheetTokens.textPrimary};
  margin: 0 0 4px;
`;

export const SheetSubtitle = styled.p`
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 13px;
  line-height: 20px;
  letter-spacing: -0.3px;
  color: ${sheetTokens.textSecondary};
  margin: 0;
`;

export const SheetSubtitleStrong = styled.strong`
  font-weight: 700;
  color: ${sheetTokens.textPrimary};
`;

export const SheetContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding-top: 16px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
`;

const fadeIn = keyframes`
  from { opacity: 0; }
  to   { opacity: 1; }
`;

export const SheetCenteredStatus = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 24px 0;
  animation: ${fadeIn} 180ms ease-out both;
`;

export const SheetStatusTitle = styled.div`
  font-family: 'Inter', sans-serif;
  font-weight: 600;
  font-size: 15px;
  line-height: 24px;
  letter-spacing: -0.3px;
  color: ${sheetTokens.textPrimary};
  margin-top: 4px;
`;

export const SheetStatusSubtitle = styled.div`
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 13px;
  line-height: 20px;
  letter-spacing: -0.3px;
  color: ${sheetTokens.textSecondary};
`;

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

export const SheetSpinner = styled.div`
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2.5px solid rgba(254, 235, 41, 0.25);
  border-top-color: ${sheetTokens.brandYellow};
  animation: ${spin} 0.9s linear infinite;
`;

export const SheetFieldRow = styled.div`
  display: flex;
  gap: 16px;
`;

export const SheetField = styled.label<{ $width?: string }>`
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: ${(p) => p.$width ?? 'auto'};
  flex: ${(p) => (p.$width ? '0 0 auto' : '1 1 0')};
  min-width: 0;
`;

export const SheetFieldLabel = styled.span`
  font-family: 'Inter', sans-serif;
  font-weight: 400;
  font-size: 11px;
  line-height: 16px;
  letter-spacing: -0.3px;
  color: ${sheetTokens.textSecondary};
`;

export const SheetInput = styled.input`
  box-sizing: border-box;
  width: 100%;
  padding: 8px 12px;
  border: 2px solid ${sheetTokens.inputBorder};
  border-radius: 8px;
  background: transparent;
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 15px;
  line-height: 24px;
  letter-spacing: -0.3px;
  color: ${sheetTokens.textPrimary};
  outline: none;
  transition: border-color 120ms ease;

  &::placeholder { color: rgba(36, 36, 36, 0.5); }
  &:focus { border-color: ${sheetTokens.textPrimary}; }
  &:disabled { opacity: 0.6; }
`;

export const SheetErrorText = styled.div`
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  line-height: 16px;
  color: ${sheetTokens.danger};
  min-height: 16px;
`;

export const SheetPrimaryButton = styled.button`
  width: 100%;
  height: 48px;
  border: 2px solid ${sheetTokens.textPrimary};
  border-radius: 24px;
  background: ${sheetTokens.brandYellow};
  font-family: 'Inter', sans-serif;
  font-weight: 800;
  font-size: 15px;
  line-height: 20px;
  letter-spacing: -0.3px;
  color: ${sheetTokens.textPrimary};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background 120ms ease, opacity 120ms ease;

  &:hover:not(:disabled) { background: ${sheetTokens.brandYellowHover}; }
  &:active:not(:disabled) { background: ${sheetTokens.brandYellowActive}; }

  &:disabled {
    background: rgba(36, 36, 36, 0.1);
    border-color: transparent;
    color: rgba(36, 36, 36, 0.45);
    cursor: default;
  }
`;

/*
 * A neutral grey "panel" used for things like linking-code readouts
 * and connected-state decorations. Background + radius match the
 * design system's soft card treatment.
 */
export const SheetMutedPanel = styled.div`
  width: 100%;
  box-sizing: border-box;
  background: ${sheetTokens.surfaceMuted};
  border-radius: 24px;
  padding: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const SheetHintText = styled.div`
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 13px;
  line-height: 20px;
  letter-spacing: -0.3px;
  color: ${sheetTokens.textSecondary};
  text-align: center;
`;
