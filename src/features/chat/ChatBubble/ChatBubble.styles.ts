import styled, { keyframes, css } from 'styled-components';
import { theme } from '@/components/theme';

export const slideUpFadeIn = keyframes`
  0% {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  60% {
    transform: translateY(-2px) scale(1.01);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
`;

export const MessageWrapper = styled.div<{ $animate: boolean; $isUser: boolean }>`
  ${({ $animate, $isUser }) =>
    $animate &&
    css`
      animation: ${slideUpFadeIn} ${$isUser ? '0.5s' : '0.35s'} cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    `}
`;

export const BubbleRow = styled.div<{ $isUser: boolean }>`
  display: flex;
  justify-content: ${(p) => (p.$isUser ? 'flex-end' : 'flex-start')};
  padding: 4px 16px;
  /* Mobile: parent ViewContainer/MessageList already supplies the 16px
     page gutter, so don't double-pad — bubbles should sit flush with the
     rest of the page content at 16px from screen edge. */
  @media (max-width: 768px) {
    padding: 4px 0;
  }
`;

export const Bubble = styled.div<{ $isUser: boolean; $isSystem: boolean }>`
  font-size: 16px;
  line-height: 1.5;
  word-wrap: break-word;

  @media (max-width: 768px) {
    font-size: 15px;
  }
  white-space: ${(p) => (p.$isUser ? 'pre-wrap' : 'normal')};

  ${(p) =>
    p.$isSystem
      ? `
    max-width: 90%;
    padding: 10px 14px;
    background-color: ${theme.colors.errorBg};
    color: ${theme.colors.error};
    border-radius: ${theme.borderRadius.sm};
    font-size: 13px;
  `
      : p.$isUser
        ? `
    max-width: 85%;
    padding: 8px 16px;
    border-radius: ${theme.borderRadius.lg};
    background-color: ${theme.colors.userBubble};
    color: ${theme.colors.userBubbleText};
  `
        : `
    width: 100%;
    color: ${theme.colors.textPrimary};
  `}
`;

export const Timestamp = styled.span<{ $isUser: boolean }>`
  display: block;
  font-size: 11px;
  color: ${theme.colors.textMuted};
  margin-top: 4px;
  text-align: ${(p) => (p.$isUser ? 'right' : 'left')};
  padding: 0 16px;
  @media (max-width: 768px) {
    padding: 0;
  }
`;

export const TimestampRow = styled.div<{ $isUser: boolean }>`
  display: flex;
  align-items: center;
  justify-content: ${(p) => (p.$isUser ? 'flex-end' : 'flex-start')};
  gap: 4px;
  margin-top: 4px;
  padding: 0 16px;
  @media (max-width: 768px) {
    padding: 0;
  }
`;

export const TimestampText = styled.span`
  font-size: 11px;
  color: ${theme.colors.textMuted};
`;
