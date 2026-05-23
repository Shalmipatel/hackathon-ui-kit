/**
 * Application bootstrap module.
 * Initializes providers, creates the store, and sets up listeners.
 */

import { createChatStore, type ChatStore } from '@/store';
import { setupNotificationListener } from '@/features/notifications';
import { initializeProviders, getProviders, getPlatformEvents } from './providers';
import { setupStreamListener } from './stream-listener';
import { setupTitleListener } from './title-listener';
import { setupPersistence } from './persistence';
import { setupNotificationBadgeListener } from './notification-badge-listener';
import { setupChatResumeListener } from './chat-resume-listener';
import { initLifecycle, disposeLifecycle } from '@/providers/lifecycle';
import { useUserPreferencesStore } from '@/features/settings/user-preferences-store';
import type { StoreApi, UseBoundStore } from 'zustand';

type ChatStoreInstance = UseBoundStore<StoreApi<ChatStore>>;

let chatStore: ChatStoreInstance | null = null;
let cleanupFns: (() => void)[] = [];

export async function bootstrap(): Promise<ChatStoreInstance> {
  console.log('[Bootstrap] Starting bootstrap...');
  if (chatStore) {
    console.log('[Bootstrap] Already initialized, returning existing store');
    return chatStore;
  }

  initializeProviders();
  console.log('[Bootstrap] Providers initialized');

  initLifecycle();
  console.log('[Bootstrap] Lifecycle refresh coordinator initialized');

  const providers = getProviders();

  chatStore = createChatStore({
    chatRepo: providers.chatRepo,
    streamClient: providers.streamClient,
    systemSession: providers.systemSession,
    sessionSyncService: providers.sessionSync,
  });

  const unsubscribeStream = setupStreamListener(chatStore);
  const unsubscribeTitle = setupTitleListener(chatStore);
  const unsubscribePersistence = setupPersistence(chatStore);

  const unsubscribeNotifications = setupNotificationListener();
  const unsubscribeBadge = setupNotificationBadgeListener();
  const unsubscribeChatResume = setupChatResumeListener(chatStore);

  cleanupFns.push(unsubscribeStream, unsubscribeTitle, unsubscribePersistence, unsubscribeNotifications, unsubscribeBadge, unsubscribeChatResume);

  providers.platformEvents.start().catch((err) =>
    console.error('[Bootstrap] Failed to start PlatformEvents:', err),
  );
  await loadTimezone();
  console.log('[Bootstrap] Hydrating store...');
  await chatStore.getState().hydrate();
  console.log('[Bootstrap] Store hydrated, activeSessionId:', chatStore.getState().activeSessionId);

  return chatStore;
}

function getSystemTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

async function loadTimezone(): Promise<void> {
  const store = useUserPreferencesStore.getState();
  try {
    const saved = await getProviders().preferenceRepo.get<string>('user', 'timezone');
    if (saved) {
      store.setTimezone(saved);
    } else {
      const systemTz = getSystemTimezone();
      store.setTimezone(systemTz);
      await getProviders().preferenceRepo.set('user', 'timezone', systemTz);
    }
  } catch {
    store.setTimezone(getSystemTimezone());
    console.warn('[Bootstrap] Failed to load timezone preference');
  }
}

export function getChatStore(): ChatStoreInstance {
  if (!chatStore) {
    throw new Error('Store not initialized. Call bootstrap() first.');
  }
  return chatStore;
}

export function useChatStore<T>(selector: (state: ChatStore) => T): T {
  const store = getChatStore();
  return store(selector);
}

export function cleanup(): void {
  for (const fn of cleanupFns) {
    fn();
  }
  disposeLifecycle();
  try {
    getPlatformEvents().stop();
  } catch {
    // Providers may not be initialized
  }
  cleanupFns = [];
  chatStore = null;
}

export {
  initializeProviders,
  getProviders,
  getStorageProvider,
  getChatRepo,
  getAuthProvider,
  getGateway,
  getStreamClient,
  getNonStreamingClient,
  getSystemSession,
  getSessionSyncService,
  getPlatformEvents,
  getConnectionManager,
} from './providers';
