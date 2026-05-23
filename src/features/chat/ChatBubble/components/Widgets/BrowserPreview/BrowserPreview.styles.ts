import styled, { keyframes, css } from 'styled-components';
import { theme } from '@/components/theme';

// Brand = #feeb29 = rgb(254, 235, 41)
const B = '254, 235, 41';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
`;

export const PreviewCard = styled.div`
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(36, 36, 36, 0.1);
  border-radius: 12px;
  overflow: hidden;
  animation: ${fadeIn} 0.3s ease both;
  width: 85%;
  margin: 0 auto;
`;

export const PreviewHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 4px 16px;
  background: rgba(36, 36, 36, 0.1);
`;

export const PreviewTitle = styled.div`
  flex: 1;
  font-family: 'Inter', sans-serif;
  font-weight: 700;
  font-size: 13px;
  line-height: 20px;
  letter-spacing: -0.3px;
  color: #242424;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const HeaderIconButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: transparent;
  color: rgba(36, 36, 36, 0.75);
  cursor: pointer;
  flex-shrink: 0;
  border-radius: 4px;
  transition: background 0.15s;

  &:hover {
    background: rgba(36, 36, 36, 0.08);
  }
`;

/* ── Modal ── */

export const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(36, 36, 36, 0.3);
  backdrop-filter: blur(2.5px);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: ${fadeIn} 0.2s ease both;
`;

export const ModalCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: 32px;
  width: 1160px;
  max-width: 94vw;
  max-height: 90vh;
  padding: 24px;
  background: #ffffff;
  border: 1px solid rgba(36, 36, 36, 0.05);
  border-radius: 24px;
`;

export const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

export const ModalTitle = styled.div`
  font-family: 'Inter', sans-serif;
  font-weight: 700;
  font-size: 15px;
  line-height: 24px;
  letter-spacing: -0.3px;
  color: #242424;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const ModalControls = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

export const ModalCloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: transparent;
  color: rgba(36, 36, 36, 0.75);
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.15s;

  &:hover {
    background: rgba(36, 36, 36, 0.08);
  }
`;

export const ModalViewerWrap = styled.div`
  width: 100%;
  height: 626px;
  border-radius: 16px;
  overflow: hidden;
  background: #111;
`;

/* ── Agent Active Overlay (blocks interaction while streaming) ── */

export const AgentActiveOverlay = styled.div`
  position: absolute;
  inset: 0;
  z-index: 50;
  cursor: not-allowed;
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const PulsingBorder = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 51;
  border: 4px solid transparent;
  animation: pulseBorder 2s ease-in-out infinite;

  @keyframes pulseBorder {
    0%, 100% {
      border-color: rgba(${B}, 0.6);
      box-shadow:
        inset 0 0 40px 15px rgba(${B}, 0.35),
        inset 0 0 80px 30px rgba(${B}, 0.2),
        inset 0 0 120px 50px rgba(${B}, 0.1);
    }
    50% {
      border-color: rgba(${B}, 1);
      box-shadow:
        inset 0 0 60px 25px rgba(${B}, 0.5),
        inset 0 0 120px 50px rgba(${B}, 0.3),
        inset 0 0 180px 80px rgba(${B}, 0.15);
    }
  }
`;

/* ── Cursor hover tooltip ── */

export const CursorTooltip = styled.div<{ $x: number; $y: number; $visible: boolean }>`
  position: fixed;
  left: ${(p) => p.$x + 16}px;
  top: ${(p) => p.$y + 16}px;
  padding: 6px 12px;
  background: #1a1a1a;
  border: 1px solid rgba(${B}, 0.6);
  border-radius: 6px;
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  font-weight: 500;
  color: ${theme.colors.brand};
  pointer-events: none;
  z-index: 9999;
  opacity: ${(p) => (p.$visible ? 1 : 0)};
  transition: opacity 0.15s;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  display: flex;
  align-items: center;
  gap: 6px;

  &::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${theme.colors.brand};
    animation: tooltipPulse 1.5s ease-in-out infinite;
  }

  @keyframes tooltipPulse {
    0%, 100% { opacity: 0.4; transform: scale(0.8); }
    50% { opacity: 1; transform: scale(1); }
  }
`;

/* ── Idle overlay (post-stream, transparent, blocks clicks) ── */

export const IdleOverlay = styled.div`
  position: absolute;
  inset: 0;
  z-index: 50;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
`;

/* ── Action button (Take over / Interact) with auto-dismiss ── */

const actionBtnFadeIn = keyframes`
  from { opacity: 0; transform: scale(0.92); }
  to   { opacity: 1; transform: scale(1); }
`;

const actionBtnFadeOut = keyframes`
  from { opacity: 1; transform: scale(1); }
  to   { opacity: 0; transform: scale(0.92); }
`;

export const ActionButton = styled.button<{ $fadeOut?: boolean }>`
  position: relative;
  z-index: 52;
  padding: 10px 24px;
  border: 1px solid rgba(${B}, 0.5);
  border-radius: 8px;
  background: ${theme.colors.background};
  backdrop-filter: blur(8px);
  font-family: 'Inter', sans-serif;
  font-weight: 600;
  font-size: 13px;
  line-height: 20px;
  letter-spacing: -0.2px;
  color: ${theme.colors.brand};
  cursor: pointer;
  pointer-events: auto;
  transition: background 0.15s, border-color 0.15s, color 0.15s;

  animation: ${(p) =>
    p.$fadeOut
      ? css`${actionBtnFadeOut} 0.4s ease forwards`
      : css`${actionBtnFadeIn} 0.25s ease both`};

  &:hover {
    background: ${theme.colors.brand};
    border-color: ${theme.colors.brand};
    color: ${theme.colors.background};
  }
`;

/* ── Session Ended Overlay ── */

export const EndedOverlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(17, 17, 17, 0.88);
  backdrop-filter: blur(4px);
  z-index: 2;
`;

export const EndedIconWrap = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.7);
`;

export const EndedText = styled.div`
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 13px;
  line-height: 20px;
  letter-spacing: -0.3px;
  color: rgba(255, 255, 255, 0.7);
`;

export const ViewerWrapRelative = styled.div`
  width: 100%;
  aspect-ratio: 16 / 9;
  flex-shrink: 0;
  overflow: hidden;
  background: #111;
  position: relative;
  @media (max-width: 768px) { aspect-ratio: 9 / 12; }
`;
