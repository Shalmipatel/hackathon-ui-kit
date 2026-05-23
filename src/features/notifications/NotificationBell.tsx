import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { theme } from '@/components/theme';
import { formatTimeAgo } from '@/core';
import { useNotificationStore, selectUnreadCount } from './notification-store';

/* ─── props ─── */

interface NotificationBellProps {
  onViewAll: () => void;
  onNotificationClick: (notification: any) => void;
}

/* ─── styled ─── */

const Wrapper = styled.div`
  position: relative;
`;

const BellButton = styled.button`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  color: ${theme.colors.textSecondary};
  transition: all 0.15s ease;

  &:hover {
    background: ${theme.colors.background};
    color: ${theme.colors.textPrimary};
  }
`;

const Badge = styled.span`
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: ${theme.colors.error};
  color: #ffffff;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  pointer-events: none;
`;

const Dropdown = styled.div`
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 360px;
  max-height: 400px;
  display: flex;
  flex-direction: column;
  background: ${theme.colors.surface};
  border: 1px solid ${theme.colors.border};
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  z-index: 1000;
  overflow: hidden;
`;

const DropdownHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid ${theme.colors.border};
  flex-shrink: 0;
`;

const DropdownTitle = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: ${theme.colors.textPrimary};
`;

const MarkAllReadButton = styled.button`
  border: none;
  background: transparent;
  font-size: 12px;
  font-weight: 500;
  color: ${theme.colors.primary};
  cursor: pointer;
  padding: 0;

  &:hover {
    text-decoration: underline;
  }
`;

const NotificationList = styled.div`
  flex: 1;
  overflow-y: auto;
`;

const NotificationRow = styled.button<{ $unread: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  border: none;
  background: ${({ $unread }) => ($unread ? '#f8f7ff' : 'transparent')};
  padding: 12px 16px;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s ease;

  &:hover {
    background: ${theme.colors.background};
  }

  & + & {
    border-top: 1px solid ${theme.colors.border};
  }
`;

const UnreadDot = styled.span<{ $visible: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${theme.colors.primary};
  flex-shrink: 0;
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
`;

const NotificationContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const NotificationTitle = styled.span`
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: ${theme.colors.textPrimary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const NotificationTime = styled.span`
  font-size: 11px;
  color: ${theme.colors.textSecondary};
  white-space: nowrap;
  flex-shrink: 0;
`;

const DropdownFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 16px;
  border-top: 1px solid ${theme.colors.border};
  flex-shrink: 0;
`;

const ViewAllLink = styled.button`
  border: none;
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  color: ${theme.colors.primary};
  cursor: pointer;
  padding: 0;

  &:hover {
    text-decoration: underline;
  }
`;

const EmptyState = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  font-size: 13px;
  color: ${theme.colors.textSecondary};
`;

/* ─── component ─── */

export const NotificationBell: React.FC<NotificationBellProps> = ({
  onViewAll,
  onNotificationClick,
}) => {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const notifications = useNotificationStore(s => s.notifications);
  const readIds = useNotificationStore(s => s.readIds);
  const unreadCount = useNotificationStore(selectUnreadCount);
  const markAsRead = useNotificationStore(s => s.markAsRead);
  const markAllAsRead = useNotificationStore(s => s.markAllAsRead);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const latestNotifications = notifications.slice(0, 6);

  const handleNotificationClick = (notification: any) => {
    if (!readIds.has(notification.id)) {
      markAsRead(notification.id);
    }
    onNotificationClick(notification);
    setOpen(false);
  };

  const handleMarkAllRead = () => {
    markAllAsRead();
  };

  const handleViewAll = () => {
    setOpen(false);
    onViewAll();
  };

  const badgeLabel = unreadCount > 9 ? '9+' : String(unreadCount);

  return (
    <Wrapper ref={wrapperRef}>
      <BellButton onClick={() => setOpen(prev => !prev)} aria-label="Notifications">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && <Badge>{badgeLabel}</Badge>}
      </BellButton>

      {open && (
        <Dropdown>
          <DropdownHeader>
            <DropdownTitle>Notifications</DropdownTitle>
            {unreadCount > 0 && (
              <MarkAllReadButton onClick={handleMarkAllRead}>
                Mark all read
              </MarkAllReadButton>
            )}
          </DropdownHeader>

          <NotificationList>
            {latestNotifications.length === 0 ? (
              <EmptyState>No notifications yet</EmptyState>
            ) : (
              latestNotifications.map(notification => {
                const isUnread = !readIds.has(notification.id);
                return (
                  <NotificationRow
                    key={notification.id}
                    $unread={isUnread}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <UnreadDot $visible={isUnread} />
                    <NotificationContent>
                      <NotificationTitle>
                        {notification.jobName}: {notification.summary}
                      </NotificationTitle>
                    </NotificationContent>
                    <NotificationTime>{formatTimeAgo(notification.ts, true)}</NotificationTime>
                  </NotificationRow>
                );
              })
            )}
          </NotificationList>

          <DropdownFooter>
            <ViewAllLink onClick={handleViewAll}>View all</ViewAllLink>
          </DropdownFooter>
        </Dropdown>
      )}
    </Wrapper>
  );
};

export default NotificationBell;
