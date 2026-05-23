import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styled, { keyframes } from 'styled-components';
import { theme } from '@/components/theme';
import type { CronNotification } from '@/types';
import { parseSkillFrontmatter } from '@/types';

const slideIn = keyframes`
  from {
    opacity: 0;
    transform: translateX(100%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
`;

const slideOut = keyframes`
  from {
    opacity: 1;
    transform: translateX(0);
  }
  to {
    opacity: 0;
    transform: translateX(100%);
  }
`;

const ToastContainer = styled.button<{ $fading: boolean }>`
  position: fixed;
  top: calc(env(safe-area-inset-top, 0) + 16px);
  right: calc(env(safe-area-inset-right, 0) + 16px);
  z-index: 9999;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  max-width: 360px;
  background: ${theme.colors.surface};
  border: 1px solid ${theme.colors.border};
  border-radius: 12px;
  box-shadow: ${theme.shadows.lg};
  cursor: pointer;
  text-align: left;
  font-family: ${theme.fontFamily};
  animation: ${(p) => (p.$fading ? slideOut : slideIn)} 0.3s ease forwards;
  transition: background 0.15s, border-color 0.15s;

  &:hover {
    background: ${theme.colors.background};
    border-color: ${theme.colors.primary};
  }
`;

const IconWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: rgba(59, 130, 246, 0.1);
  color: #3B82F6;
  flex-shrink: 0;
`;

const Content = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const Title = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: ${theme.colors.textPrimary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  p { margin: 0; display: inline; }
  strong { font-weight: 700; }
  em { font-style: italic; }
  code {
    font-family: 'SF Mono', Consolas, monospace;
    font-size: 0.9em;
    background: rgba(0, 0, 0, 0.06);
    padding: 1px 4px;
    border-radius: 3px;
  }
  a {
    color: ${theme.colors.primary};
    text-decoration: none;
  }
`;

const Message = styled.div`
  font-size: 12px;
  color: ${theme.colors.textSecondary};
  margin: 0;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;

  p { margin: 0; }
  strong { font-weight: 600; }
  em { font-style: italic; }
  code {
    font-family: 'SF Mono', Consolas, monospace;
    font-size: 0.9em;
    background: rgba(0, 0, 0, 0.06);
    padding: 1px 4px;
    border-radius: 3px;
  }
  a {
    color: ${theme.colors.primary};
    text-decoration: none;
  }
  ul, ol { margin: 0; padding-left: 16px; }
  li { margin: 0; }
  h1, h2, h3, h4, h5, h6 {
    font-size: inherit;
    font-weight: 600;
    margin: 0;
  }
  pre { display: none; }
  hr { display: none; }
  table { display: none; }
  blockquote {
    margin: 0;
    padding-left: 8px;
    border-left: 2px solid ${theme.colors.border};
  }
`;

const Hint = styled.span`
  font-size: 11px;
  color: ${theme.colors.textMuted};
  margin-top: 4px;
`;

const CloseButton = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  color: ${theme.colors.textMuted};
  flex-shrink: 0;
  transition: color 0.15s, background 0.15s;

  &:hover {
    color: ${theme.colors.textPrimary};
    background: ${theme.colors.assistantBubble};
  }
`;

function parseNotificationContent(notification: CronNotification): { title: string; summary: string } {
  const raw = notification.fullResponse || notification.summary || '';
  const parsed = parseSkillFrontmatter(raw);

  if (parsed?.meta.title) {
    const title = String(parsed.meta.title);
    const body = parsed.body.trim();
    const firstLine = body.split('\n')[0].replace(/^[*\-]\s*/, '').replace(/\*\*/g, '').trim();
    return { title, summary: firstLine || body.slice(0, 80) };
  }

  const name = notification.jobName || notification.jobId;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name);

  if (isUuid) {
    const summary = notification.summary || '';
    if (summary.length > 0) {
      const firstLine = summary.split('\n')[0].trim();
      if (firstLine.length > 0) {
        return { title: firstLine.length > 35 ? firstLine.slice(0, 35) + '...' : firstLine, summary };
      }
    }
    return { title: `Task ${name.slice(0, 8)}...`, summary };
  }

  return { title: name.length > 35 ? name.slice(0, 35) + '...' : name, summary: notification.summary || 'Scheduled task completed' };
}

interface NotificationToastProps {
  notification: CronNotification | null;
  fading: boolean;
  onClick: () => void;
  onDismiss: () => void;
}

export const NotificationToast: React.FC<NotificationToastProps> = ({
  notification,
  fading,
  onClick,
  onDismiss,
}) => {
  if (!notification) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick();
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDismiss();
  };

  const { title, summary } = parseNotificationContent(notification);

  return (
    <ToastContainer $fading={fading} onClick={handleClick}>
      <IconWrapper>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      </IconWrapper>
      <Content>
        <Title>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{title}</ReactMarkdown>
        </Title>
        <Message>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
        </Message>
        <Hint>Click to view details</Hint>
      </Content>
      <CloseButton onClick={handleDismiss}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </CloseButton>
    </ToastContainer>
  );
};

export default NotificationToast;
