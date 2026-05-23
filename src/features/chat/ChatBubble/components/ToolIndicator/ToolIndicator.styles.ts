import styled from 'styled-components';
import { theme } from '@/components/theme';

export const ThinkingIndicator = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 6px 12px;
  border-radius: 8px;
  background: rgba(108, 92, 231, 0.08);
  color: ${theme.colors.primary};
  font-size: 13px;
  font-weight: 500;
  animation: fadeIn 0.3s ease;

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;

export const ThinkingDots = styled.span`
  display: inline-flex;
  gap: 2px;

  span {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: ${theme.colors.primary};
    animation: bounce 1.4s infinite ease-in-out both;

    &:nth-child(1) {
      animation-delay: -0.32s;
    }
    &:nth-child(2) {
      animation-delay: -0.16s;
    }
    &:nth-child(3) {
      animation-delay: 0s;
    }
  }

  @keyframes bounce {
    0%,
    80%,
    100% {
      transform: scale(0);
    }
    40% {
      transform: scale(1);
    }
  }
`;

export const InlineThinkingIndicator = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: ${theme.colors.textSecondary};
  margin: 8px 0 0 0;
  line-height: 16px;
  animation: fadeIn 0.3s ease;

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;

export const ToolIndicatorPill = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 6px 12px;
  border-radius: 8px;
  background: rgba(108, 92, 231, 0.08);
  color: ${theme.colors.primary};
  font-size: 13px;
  font-weight: 500;
  animation: fadeIn 0.3s ease;

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;

export const ToolDots = styled.span`
  display: inline-flex;
  gap: 2px;

  span {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: ${theme.colors.primary};
    animation: bounce 1.4s infinite ease-in-out both;

    &:nth-child(1) {
      animation-delay: -0.32s;
    }
    &:nth-child(2) {
      animation-delay: -0.16s;
    }
    &:nth-child(3) {
      animation-delay: 0s;
    }
  }

  @keyframes bounce {
    0%,
    80%,
    100% {
      transform: scale(0);
    }
    40% {
      transform: scale(1);
    }
  }
`;

export const InlineToolIndicator = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: ${theme.colors.textSecondary};
  margin: 14px 0 0 0;
  line-height: 16px;
`;

export const InlineToolSpinner = styled.span`
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid ${theme.colors.border};
  border-top-color: ${theme.colors.textSecondary};
  border-radius: 50%;
  animation: inlineToolSpin 0.8s linear infinite;

  @keyframes inlineToolSpin {
    to {
      transform: rotate(360deg);
    }
  }
`;

export const InlineToolIconWrapper = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  color: ${theme.colors.textSecondary};
  animation: iconPulse 1.2s ease-in-out infinite;

  svg {
    width: 12px;
    height: 12px;
  }

  @keyframes iconPulse {
    0%,
    100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.3);
      opacity: 0.9;
    }
  }
`;

export const InlineToolText = styled.span`
  display: inline-block;
  animation: textFadeSlide 0.25s ease-out;

  @keyframes textFadeSlide {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;
