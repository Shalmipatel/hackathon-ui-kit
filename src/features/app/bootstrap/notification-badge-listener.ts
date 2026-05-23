/**
 * Notification badge listener.
 * Subscribes to the notification store (when enabled) to keep document.title
 * stable.
 *
 * The active title is kept as a clean "AI Assistant" regardless of unread
 * count — a "(N) AI Assistant" prefix leaks into iOS share sheets and
 * home-screen bookmark suggestions. The badge count is still surfaced
 * in-app via the sidebar/nav unread badges.
 */

import { useNotificationStore } from '@/features/notifications';
import { getDefaultConfig } from '@/features/app/config';

const BASE_TITLE = 'AI Assistant';

export function setupNotificationBadgeListener(): () => void {
  const { showCronNotifications } = getDefaultConfig().features;

  const update = () => {
    document.title = BASE_TITLE;
  };

  update();

  const unsubNotifications = showCronNotifications
    ? useNotificationStore.subscribe(
        (state) => state.unreadCount,
        () => update(),
      )
    : undefined;

  return () => {
    unsubNotifications?.();
  };
}
