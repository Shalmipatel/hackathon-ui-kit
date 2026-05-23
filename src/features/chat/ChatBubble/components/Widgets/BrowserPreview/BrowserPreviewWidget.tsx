import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { RemoteBrowserViewer } from '@/features/browser/RemoteBrowserViewer';
import { getChatStore } from '@/features/app/bootstrap';
import {
  PreviewCard,
  PreviewHeader,
  PreviewTitle,
  HeaderIconButton,
  ViewerWrapRelative,
  AgentActiveOverlay,
  PulsingBorder,
  CursorTooltip,
  IdleOverlay,
  ActionButton,
  EndedOverlay,
  EndedIconWrap,
  EndedText,
  ModalOverlay,
  ModalCard,
  ModalHeader,
  ModalTitle,
  ModalControls,
  ModalCloseButton,
  ModalViewerWrap,
} from './BrowserPreview.styles';

const ACTION_BTN_VISIBLE_MS = 3000;
const ACTION_BTN_FADEOUT_MS = 400;

const ExpandIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 3 21 3 21 9" />
    <polyline points="9 21 3 21 3 15" />
    <line x1="21" y1="3" x2="14" y2="10" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </svg>
);

const CloseIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const BrowserIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="14" x="3" y="3" rx="2" />
    <path d="M3 9h18" />
    <circle cx="6" cy="6" r=".5" fill="currentColor" />
    <circle cx="9" cy="6" r=".5" fill="currentColor" />
  </svg>
);

interface BrowserPreviewWidgetProps {
  active: boolean;
  isStreaming: boolean;
}

export const BrowserPreviewWidget: React.FC<BrowserPreviewWidgetProps> = React.memo(({ active, isStreaming }) => {
  const [expanded, setExpanded] = useState(false);

  // Cursor tooltip tracking for agent-active overlay
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [cursorInViewer, setCursorInViewer] = useState(false);
  const viewerRef = useRef<HTMLDivElement>(null);

  // "Take over" / "Interact" button state
  const [actionVisible, setActionVisible] = useState(false);
  const [actionFadeOut, setActionFadeOut] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // User unlocked interaction (post-stream idle state only)
  const [userInteracting, setUserInteracting] = useState(false);

  // Reset userInteracting if streaming starts again or bubble deactivates
  useEffect(() => {
    if (isStreaming || !active) {
      setUserInteracting(false);
    }
  }, [isStreaming, active]);

  // Clean up timers
  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, []);

  // Hide button when streaming or active state changes
  useEffect(() => {
    setActionVisible(false);
    setActionFadeOut(false);
  }, [isStreaming, active]);

  const showActionButton = useCallback(() => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    setActionFadeOut(false);
    setActionVisible(true);

    dismissTimerRef.current = setTimeout(() => {
      setActionFadeOut(true);
      fadeTimerRef.current = setTimeout(() => {
        setActionVisible(false);
        setActionFadeOut(false);
      }, ACTION_BTN_FADEOUT_MS);
    }, ACTION_BTN_VISIBLE_MS);
  }, []);

  const handleOverlayClickWhileStreaming = useCallback(() => {
    showActionButton();
  }, [showActionButton]);

  const handleTakeOver = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const state = getChatStore().getState();
    if (state.activeSessionId) {
      state.abortStream(state.activeSessionId);
    }
    setActionVisible(false);
    setActionFadeOut(false);
  }, []);

  const handleIdleOverlayClick = useCallback(() => {
    showActionButton();
  }, [showActionButton]);

  const handleInteract = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setUserInteracting(true);
    setActionVisible(false);
    setActionFadeOut(false);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setCursorPos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleMouseEnter = useCallback(() => setCursorInViewer(true), []);
  const handleMouseLeave = useCallback(() => setCursorInViewer(false), []);

  const openModal = useCallback(() => {
    if (active && !isStreaming) setExpanded(true);
  }, [active, isStreaming]);
  const closeModal = useCallback(() => setExpanded(false), []);

  const handleModalOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) closeModal();
    },
    [closeModal],
  );

  // Determine the overlay state
  const showStreamingOverlay = active && isStreaming;
  const showIdleOverlay = active && !isStreaming && !userInteracting;
  const showEndedOverlay = !active;

  return (
    <>
      <PreviewCard>
        <PreviewHeader>
          <PreviewTitle>Secure Browser</PreviewTitle>
          {active && !isStreaming && (
            <HeaderIconButton onClick={openModal} aria-label="Expand browser" title="Expand">
              <ExpandIcon />
            </HeaderIconButton>
          )}
        </PreviewHeader>
        <ViewerWrapRelative
          ref={viewerRef}
          onMouseMove={showStreamingOverlay ? handleMouseMove : undefined}
          onMouseEnter={showStreamingOverlay ? handleMouseEnter : undefined}
          onMouseLeave={showStreamingOverlay ? handleMouseLeave : undefined}
        >
          <RemoteBrowserViewer active={active} loadingText="Connecting to browser..." />

          {/* State 1: Agent is streaming — pulsing border + block + tooltip + Take over */}
          {showStreamingOverlay && (
            <>
              <AgentActiveOverlay onClick={handleOverlayClickWhileStreaming}>
                {actionVisible && (
                  <ActionButton $fadeOut={actionFadeOut} onClick={handleTakeOver}>
                    Take over
                  </ActionButton>
                )}
              </AgentActiveOverlay>
              <PulsingBorder />
            </>
          )}

          {/* State 2: Stream done, still last assistant — transparent block + Interact */}
          {showIdleOverlay && (
            <IdleOverlay onClick={handleIdleOverlayClick}>
              {actionVisible && (
                <ActionButton $fadeOut={actionFadeOut} onClick={handleInteract}>
                  Interact
                </ActionButton>
              )}
            </IdleOverlay>
          )}

          {/* State 3: New user message sent — ended overlay */}
          {showEndedOverlay && (
            <EndedOverlay>
              <EndedIconWrap>
                <BrowserIcon />
              </EndedIconWrap>
              <EndedText>Secure browser was used in this session</EndedText>
            </EndedOverlay>
          )}
        </ViewerWrapRelative>
      </PreviewCard>

      {/* Cursor tooltip rendered via portal (only during streaming) */}
      {showStreamingOverlay && cursorInViewer &&
        createPortal(
          <CursorTooltip $x={cursorPos.x} $y={cursorPos.y} $visible={cursorInViewer}>
            Agent is working
          </CursorTooltip>,
          document.body,
        )}

      {/* Expanded modal (only when idle and user interacting) */}
      {expanded && active && !isStreaming &&
        createPortal(
          <ModalOverlay onClick={handleModalOverlayClick}>
            <ModalCard onClick={(e) => e.stopPropagation()}>
              <ModalHeader>
                <ModalTitle>Secure Browser</ModalTitle>
                <ModalControls>
                  <ModalCloseButton onClick={closeModal} aria-label="Close">
                    <CloseIcon />
                  </ModalCloseButton>
                </ModalControls>
              </ModalHeader>
              <ModalViewerWrap>
                <RemoteBrowserViewer active loadingText="Connecting to browser..." />
              </ModalViewerWrap>
            </ModalCard>
          </ModalOverlay>,
          document.body,
        )}
    </>
  );
});

BrowserPreviewWidget.displayName = 'BrowserPreviewWidget';
