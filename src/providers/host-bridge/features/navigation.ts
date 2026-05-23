/**
 * Typed facade over the `navigation.*` host-bridge namespace.
 *
 * Listens for deep-link events emitted by the native shell when the user
 * taps a push notification (or any other native trigger that should land
 * on a specific screen). Dispatches into the Zustand `useNavigationStore`
 * so TabPage picks up the intent on the next render.
 *
 * On the web (no native host) `listen()` returns a no-op unsubscribe,
 * so callers don't need platform checks.
 */

import { hostBridge } from '../core';
import { useNavigationStore } from '@/features/navigation';
import { toClientKey } from '@/providers/sync/session-key.util';

const TOPIC_DEEP_LINK = 'navigation.deepLink';

interface DeepLinkPayload {
  target: 'home' | 'chat';
  /** Chat session ID when target is 'chat'. If missing or unusable, we fall back to home. */
  sessionId?: string;
}

export const navigationBridge = {
  /**
   * Start listening for native deep-link events. Call once at app bootstrap
   * (e.g. inside a top-level `useEffect`). Returns an unsubscribe function.
   */
  listen(): () => void {
    return hostBridge.subscribe<DeepLinkPayload>(TOPIC_DEEP_LINK, (payload) => {
      const store = useNavigationStore.getState();
      switch (payload.target) {
        case 'home':
          store.goToHome();
          break;
        case 'chat': {
          const raw =  payload.sessionId?.trim()
          const chatSessionId = toClientKey(raw || '');
          if (chatSessionId) {
            store.goToChat(chatSessionId);
            break;
          }
          store.goToHome();
          break;
        }
      }
    });
  },
};

export type NavigationBridge = typeof navigationBridge;
