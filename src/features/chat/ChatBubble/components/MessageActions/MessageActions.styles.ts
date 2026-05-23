import styled from 'styled-components';
import { theme } from '@/components/theme';
import { MessageWrapper } from '../../ChatBubble.styles';

export const InlineCopyButton = styled.button<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: ${(p) => (p.$active ? theme.colors.textPrimary : theme.colors.textMuted)};
  cursor: pointer;
  transition: background 0.15s, color 0.15s, opacity 0.15s;
  padding: 4px;
  opacity: 0;

  &:hover {
    background: ${theme.colors.border};
    color: ${theme.colors.textPrimary};
  }

  ${MessageWrapper}:hover & {
    opacity: 1;
  }

  svg {
    flex-shrink: 0;
  }
`;

export const MessageActionsContainer = styled.div<{ $isUser: boolean }>`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 0;
  justify-content: ${(p) => (p.$isUser ? 'flex-end' : 'flex-start')};
  opacity: 0;
  transition: opacity 0.15s ease;
  height: 28px;

  ${MessageWrapper}:hover & {
    opacity: 1;
  }
`;

export const MessageActionBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: rgba(36, 36, 36, 0.4);
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
  padding: 0;
  flex-shrink: 0;

  &:hover {
    color: #242424;
    background: rgba(36, 36, 36, 0.06);
  }

  &:active {
    transform: scale(0.9);
  }
`;

export const ActionBar = styled.div`
  display: flex;
  align-items: center;
  gap: 0;
  padding: 8px 16px 0;
`;

export const ActionIcon = styled.button<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: ${(p) => (p.$active ? theme.colors.textPrimary : theme.colors.textMuted)};
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  padding: 8px;

  &:hover {
    background: ${theme.colors.background};
    color: ${theme.colors.textPrimary};
  }

  svg {
    flex-shrink: 0;
  }
`;
