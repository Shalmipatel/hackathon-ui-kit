/**
 * Notification store - manages cron notification state.
 *
 * Web-native implementation using IStorageProvider for persistence
 * and PlatformEvents for real-time events.
 * Replaces bridge-based callExtension(CRON_*) and onNotificationMessage.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { CronNotification } from '@/types';
import { getStorageProvider, getPlatformEvents } from '@/features/app/bootstrap/providers';

const STORAGE_KEYS = {
  NOTIFICATIONS: 'neoclaw_notifications',
  READ_IDS: 'neoclaw_notification_reads',
} as const;

const MAX_NOTIFICATIONS = 200;

export interface NotificationStoreState {
  notifications: CronNotification[];
  readIds: Set<string>;
  isHydrated: boolean;
  unreadCount: number;
}

export interface NotificationStoreActions {
  hydrate(): Promise<void>;
  addNotification(notification: CronNotification): void;
  markAsRead(id: string): Promise<void>;
  markAllAsRead(): Promise<void>;
  getUnreadCount(): number;
}

export type NotificationStore = NotificationStoreState & NotificationStoreActions;

const INITIAL_STATE: NotificationStoreState = {
  notifications: [],
  readIds: new Set(),
  isHydrated: false,
  unreadCount: 0,
};

function calculateUnreadCount(notifications: CronNotification[], readIds: Set<string>): number {
  return notifications.filter(n => !readIds.has(n.id)).length;
}

export const useNotificationStore = create<NotificationStore>()(
  subscribeWithSelector((set, get) => ({
    ...INITIAL_STATE,

    async hydrate() {
      try {
        const storageProvider = getStorageProvider();

        const notifications = await storageProvider.get<CronNotification[]>(
          STORAGE_KEYS.NOTIFICATIONS,
          [],
        );
        const readIdsArr = await storageProvider.get<string[]>(
          STORAGE_KEYS.READ_IDS,
          [],
        );

        const readIdsSet = new Set(readIdsArr);
        const unreadCount = calculateUnreadCount(notifications, readIdsSet);

        set({
          notifications,
          readIds: readIdsSet,
          isHydrated: true,
          unreadCount,
        });
      } catch (err) {
        console.error('[NotificationStore] Hydration failed:', err);
        set({ isHydrated: true });
      }
    },

    addNotification(notification: CronNotification) {
      set((state) => {
        if (state.notifications.some(n => n.id === notification.id)) {
          return state;
        }

        const newNotifications = [notification, ...state.notifications].slice(0, MAX_NOTIFICATIONS);
        const unreadCount = calculateUnreadCount(newNotifications, state.readIds);

        // Persist to storage (fire-and-forget)
        try {
          const storageProvider = getStorageProvider();
          storageProvider.set(STORAGE_KEYS.NOTIFICATIONS, newNotifications);
        } catch (err) {
          console.error('[NotificationStore] Failed to persist notification:', err);
        }

        return {
          notifications: newNotifications,
          unreadCount,
        };
      });
    },

    async markAsRead(id: string) {
      const { readIds, notifications } = get();
      if (readIds.has(id)) return;

      const newReadIds = new Set(readIds);
      newReadIds.add(id);
      const unreadCount = calculateUnreadCount(notifications, newReadIds);

      set({ readIds: newReadIds, unreadCount });

      try {
        const storageProvider = getStorageProvider();
        const existingReadIds = await storageProvider.get<string[]>(STORAGE_KEYS.READ_IDS, []);
        if (!existingReadIds.includes(id)) {
          existingReadIds.push(id);
          await storageProvider.set(STORAGE_KEYS.READ_IDS, existingReadIds);
        }
      } catch (err) {
        console.error('[NotificationStore] Failed to mark as read:', err);
        set((state) => {
          const revertedIds = new Set(state.readIds);
          revertedIds.delete(id);
          return {
            readIds: revertedIds,
            unreadCount: calculateUnreadCount(state.notifications, revertedIds),
          };
        });
      }
    },

    async markAllAsRead() {
      const { notifications } = get();
      const allIds = new Set(notifications.map(n => n.id));

      set({ readIds: allIds, unreadCount: 0 });

      try {
        const storageProvider = getStorageProvider();
        await storageProvider.set(STORAGE_KEYS.READ_IDS, Array.from(allIds));
      } catch (err) {
        console.error('[NotificationStore] Failed to mark all as read:', err);
        get().hydrate();
      }
    },

    getUnreadCount() {
      const { notifications, readIds } = get();
      return calculateUnreadCount(notifications, readIds);
    },
  })),
);

// Selectors
export const selectNotifications = (state: NotificationStore): CronNotification[] =>
  state.notifications;

export const selectUnreadCount = (state: NotificationStore): number =>
  state.unreadCount;

export const selectIsNotificationRead = (id: string) => (state: NotificationStore): boolean =>
  state.readIds.has(id);

export const selectIsHydrated = (state: NotificationStore): boolean =>
  state.isHydrated;

/**
 * Setup real-time notification listener.
 * Call this once during app bootstrap.
 */
export function setupNotificationListener(): () => void {
  const store = useNotificationStore.getState();

  store.hydrate();

  const service = getPlatformEvents();
  const unsubscribe = service.subscribe({
    onCronRun: (notification) => {
      useNotificationStore.getState().addNotification(notification);
    },
  });

  return unsubscribe;
}
