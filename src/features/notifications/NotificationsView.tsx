import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styled from 'styled-components';
import { theme } from '@/components/theme';
import { useNotificationStore, selectNotifications, selectUnreadCount } from './notification-store';
import { parseNotificationContent } from './NotificationItem';
import { formatTimeAgo } from '@/core';
import type { CronNotification } from '@/types';
import { EVENTS, track } from '@/features/analytics';

/* ── Styled Components ── */

const Container = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow-y: auto;
  padding: 40px 24px 24px;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(36, 36, 36, 0.15);
    border-radius: 3px;
  }
  scrollbar-width: thin;
  scrollbar-color: rgba(36, 36, 36, 0.15) transparent;

  @media (max-width: 768px) {
    padding: 16px 16px 24px;
  }
`;

const NotificationsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 48px;
  max-width: 722px;
  margin: 0 auto;
  width: 100%;

  @media (max-width: 768px) {
    gap: 32px;
  }
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const SectionTitle = styled.h3`
  font-family: 'Inter', ${theme.fontFamily};
  font-size: 15px;
  font-weight: 500;
  color: #242424;
  margin: 0;
  letter-spacing: -0.3px;
  line-height: 24px;
`;

/* ── Group Card (expandable) ── */

const GroupCard = styled.div<{ $expanded: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: white;
  border: 1px solid rgba(36, 36, 36, 0.05);
  border-radius: 24px;
  padding: 24px;
  overflow: hidden;
`;

const GroupHeader = styled.button`
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  border: none;
  background: none;
  cursor: pointer;
  padding: 0;
  font-family: 'Inter', ${theme.fontFamily};
  text-align: left;
`;

const GreenDot = styled.div`
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #49A078;
  flex-shrink: 0;
`;

const GroupInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-width: 0;
`;

const GroupTitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const GroupName = styled.span`
  font-family: 'Inter', ${theme.fontFamily};
  font-size: 15px;
  font-weight: 500;
  color: #2a2a2a;
  letter-spacing: -0.3px;
  line-height: 20px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const AlertCountBadge = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  background: rgba(36, 36, 36, 0.05);
  border-radius: 9999px;
  font-family: 'Inter', ${theme.fontFamily};
  font-size: 11px;
  font-weight: 400;
  color: #2a2a2a;
  letter-spacing: -0.3px;
  line-height: 16px;
  white-space: nowrap;
  flex-shrink: 0;
`;

const GroupTimestamp = styled.span`
  font-family: 'Inter', ${theme.fontFamily};
  font-size: 13px;
  font-weight: 400;
  color: rgba(36, 36, 36, 0.75);
  letter-spacing: -0.3px;
  line-height: 16px;
`;

const ChevronIcon = styled.div<{ $expanded: boolean }>`
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s ease;
  transform: ${(p) => (p.$expanded ? 'rotate(180deg)' : 'rotate(0deg)')};
  color: #71717a;
`;

/* ── Alert Items (inside expanded group) ── */

const AlertsCollapsible = styled.div<{ $expanded: boolean; $height: number }>`
  max-height: ${(p) => (p.$expanded ? `${p.$height}px` : '0')};
  overflow: hidden;
  transition: max-height 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
`;

const AlertsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const AlertItem = styled.button`
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  padding: 16px;
  background: #DCE1DE;
  border: none;
  border-radius: 16px;
  cursor: pointer;
  text-align: left;
  font-family: 'Inter', ${theme.fontFamily};
  transition: background 0.15s;

  &:hover {
    background: #f3f2f0;
  }
`;

const AlertTitle = styled.div`
  font-size: 15px;
  font-weight: 500;
  color: #2a2a2a;
  letter-spacing: -0.3px;
  line-height: 24px;
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

const AlertTimestamp = styled.span`
  font-size: 13px;
  font-weight: 400;
  color: rgba(36, 36, 36, 0.75);
  letter-spacing: -0.3px;
  line-height: 20px;
`;

/* ── Standalone Card (General section) ── */

const StandaloneCard = styled.button`
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  background: white;
  border: 1px solid rgba(36, 36, 36, 0.05);
  border-radius: 24px;
  padding: 24px;
  cursor: pointer;
  text-align: left;
  font-family: 'Inter', ${theme.fontFamily};
  transition: background 0.15s;

  &:hover {
    background: #fafafa;
  }
`;

/* ── Empty State ── */

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 24px;
  text-align: center;
`;

const EmptyIcon = styled.div`
  width: 64px;
  height: 64px;
  border-radius: 16px;
  background: rgba(36, 36, 36, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${theme.colors.textMuted};
  margin-bottom: 16px;
`;

const EmptyTitle = styled.p`
  font-size: 16px;
  font-weight: 500;
  color: ${theme.colors.textPrimary};
  margin: 0 0 8px;
`;

const EmptyDescription = styled.p`
  font-size: 14px;
  color: ${theme.colors.textSecondary};
  margin: 0;
`;

/* ── Icons ── */

const ChevronDownSvg: React.FC = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const BellOffIcon: React.FC = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5" />
    <path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    <path d="m2 2 20 20" />
  </svg>
);

/* ── Group Card Component ── */

interface NotificationGroup {
  jobId: string;
  jobName: string;
  notifications: CronNotification[];
  latestTs: number;
}

const NotificationGroupCard: React.FC<{
  group: NotificationGroup;
  onNotificationClick: (notification: CronNotification) => void;
}> = ({ group, onNotificationClick }) => {
  const [expanded, setExpanded] = useState(false);
  const alertCount = group.notifications.length;
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  const handleToggle = () => {
    if (!expanded && contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
    setExpanded(!expanded);
  };

  return (
    <GroupCard $expanded={expanded}>
      <GroupHeader onClick={handleToggle}>
        <GreenDot />
        <GroupInfo>
          <GroupTitleRow>
            <GroupName>{group.jobName}</GroupName>
            <AlertCountBadge>
              {alertCount} {alertCount === 1 ? 'alert' : 'alerts'}
            </AlertCountBadge>
          </GroupTitleRow>
          <GroupTimestamp>{formatTimeAgo(group.latestTs)}</GroupTimestamp>
        </GroupInfo>
        <ChevronIcon $expanded={expanded}>
          <ChevronDownSvg />
        </ChevronIcon>
      </GroupHeader>
      <AlertsCollapsible $expanded={expanded} $height={contentHeight}>
        <AlertsContainer ref={contentRef}>
          {group.notifications.map((notification) => {
            const summary = notification.summary || 'No summary available';
            const firstLine = summary.split('\n')[0].trim();
            const alertTitle = firstLine.length > 60 ? firstLine.slice(0, 60) + '...' : firstLine;
            return (
              <AlertItem
                key={notification.id}
                onClick={() => onNotificationClick(notification)}
              >
                <AlertTitle>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{alertTitle}</ReactMarkdown>
                </AlertTitle>
                <AlertTimestamp>{formatTimeAgo(notification.ts)}</AlertTimestamp>
              </AlertItem>
            );
          })}
        </AlertsContainer>
      </AlertsCollapsible>
    </GroupCard>
  );
};

/* ── Main Component ── */

interface NotificationsViewProps {
  onBack: () => void;
  onNotificationClick: (notification: CronNotification) => void;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  onBack,
  onNotificationClick,
}) => {
  const notifications = useNotificationStore(selectNotifications);
  const markAsRead = useNotificationStore((state) => state.markAsRead);

  const handleNotificationClick = useCallback(
    (notification: CronNotification) => {
      /* analytics tracking plan §3 Group 7 — `Notification Opened` per-tap.
       * `notification_type` collapses to the cron job's name so
       * dashboards can rank "which scheduled tasks actually drive
       * re-engagement?" without leaking message body text. */
      track(EVENTS.NOTIFICATION_OPENED, {
        notification_type: notification.jobName ?? notification.jobId ?? 'cron',
        notification_id: notification.id,
        delivery_channel: 'in_app',
      });
      markAsRead(notification.id);
      onNotificationClick(notification);
    },
    [markAsRead, onNotificationClick],
  );

  const { recurringGroups, generalNotifications } = useMemo(() => {
    const groupMap = new Map<string, CronNotification[]>();

    for (const n of notifications) {
      const key = n.jobId;
      if (!groupMap.has(key)) {
        groupMap.set(key, []);
      }
      groupMap.get(key)!.push(n);
    }

    const recurring: NotificationGroup[] = [];
    const general: CronNotification[] = [];

    for (const [jobId, items] of groupMap) {
      if (items.length > 1) {
        const sorted = [...items].sort((a, b) => b.ts - a.ts);
        const name = sorted[0].jobName || sorted[0].jobId;
        recurring.push({
          jobId,
          jobName: name,
          notifications: sorted,
          latestTs: sorted[0].ts,
        });
      } else {
        general.push(items[0]);
      }
    }

    recurring.sort((a, b) => b.latestTs - a.latestTs);
    general.sort((a, b) => b.ts - a.ts);

    return { recurringGroups: recurring, generalNotifications: general };
  }, [notifications]);

  /* analytics tracking plan §3 Group 10 — `Empty State Shown` for the
   * "no notifications yet" branch. Latched so a re-render of the
   * empty state doesn't re-fire. */
  const emptyFiredRef = useRef(false);
  useEffect(() => {
    if (notifications.length === 0 && !emptyFiredRef.current) {
      emptyFiredRef.current = true;
      track(EVENTS.EMPTY_STATE_SHOWN, {
        surface: 'notifications',
        empty_reason: 'no_notifications_yet',
      });
    } else if (notifications.length > 0) {
      emptyFiredRef.current = false;
    }
  }, [notifications.length]);

  if (notifications.length === 0) {
    return (
      <Container>
        <EmptyState>
          <EmptyIcon>
            <BellOffIcon />
          </EmptyIcon>
          <EmptyTitle>No notifications yet</EmptyTitle>
          <EmptyDescription>
            When your scheduled tasks complete, you'll see them here.
          </EmptyDescription>
        </EmptyState>
      </Container>
    );
  }

  return (
    <Container>
      <NotificationsList>
        {recurringGroups.length > 0 && (
          <Section>
            <SectionTitle>Recurring task notifications</SectionTitle>
            {recurringGroups.map((group) => (
              <NotificationGroupCard
                key={group.jobId}
                group={group}
                onNotificationClick={handleNotificationClick}
              />
            ))}
          </Section>
        )}
        {generalNotifications.length > 0 && (
          <Section>
            <SectionTitle>General</SectionTitle>
            {generalNotifications.map((notification) => {
              const { title } = parseNotificationContent(notification);
              return (
                <StandaloneCard
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <GreenDot />
                  <GroupInfo>
                    <GroupName>{title}</GroupName>
                    <GroupTimestamp>{formatTimeAgo(notification.ts)}</GroupTimestamp>
                  </GroupInfo>
                </StandaloneCard>
              );
            })}
          </Section>
        )}
      </NotificationsList>
    </Container>
  );
};

export default NotificationsView;
