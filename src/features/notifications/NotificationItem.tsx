import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styled from 'styled-components';
import { theme } from '@/components/theme';
import { formatTimeAgo } from '@/core';
import type { CronNotification } from '@/types';
import { parseSkillFrontmatter } from '@/types';

const ItemContainer = styled.button<{ $isRead: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  padding: 16px;
  border: none;
  border-radius: 12px;
  background: ${(p) => (p.$isRead ? 'transparent' : theme.colors.surface)};
  cursor: pointer;
  text-align: left;
  font-family: ${theme.fontFamily};
  transition: background 0.15s;

  &:hover {
    background: ${theme.colors.background};
  }
`;

const UnreadDot = styled.div`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #3B82F6;
  flex-shrink: 0;
  margin-top: 6px;
`;

const ReadDotPlaceholder = styled.div`
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  margin-top: 6px;
`;

const Content = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

const JobName = styled.span<{ $isRead: boolean }>`
  font-size: 14px;
  font-weight: ${(p) => (p.$isRead ? 400 : 500)};
  color: ${theme.colors.textPrimary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Timestamp = styled.span`
  font-size: 12px;
  color: ${theme.colors.textSecondary};
  white-space: nowrap;
  flex-shrink: 0;
`;

const Summary = styled.div`
  font-size: 13px;
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

interface NotificationItemProps {
  notification: CronNotification;
  isRead: boolean;
  onClick: (notification: CronNotification) => void;
}

export function parseNotificationContent(notification: CronNotification): { title: string; summary: string } {
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
        return { title: firstLine.length > 40 ? firstLine.slice(0, 40) + '...' : firstLine, summary };
      }
    }
    return { title: `Task ${name.slice(0, 8)}...`, summary };
  }

  return { title: name, summary: notification.summary || 'No summary available' };
}

export const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
  isRead,
  onClick,
}) => {
  const handleClick = () => {
    onClick(notification);
  };

  const { title, summary } = parseNotificationContent(notification);

  return (
    <ItemContainer $isRead={isRead} onClick={handleClick}>
      {isRead ? <ReadDotPlaceholder /> : <UnreadDot />}
      <Content>
        <Header>
          <JobName $isRead={isRead}>{title}</JobName>
          <Timestamp>{formatTimeAgo(notification.ts)}</Timestamp>
        </Header>
        <Summary>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
        </Summary>
      </Content>
    </ItemContainer>
  );
};

export default NotificationItem;
