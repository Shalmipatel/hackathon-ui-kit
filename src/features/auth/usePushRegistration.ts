import { useEffect, useRef } from 'react';
import { pushBridge } from '@/providers/host-bridge/features/push';
import { hostBridge } from '@/providers/host-bridge';

/**
 * Manages push notification registration in sync with auth state.
 *
 * - Registers the device when the user logs in (and permission is granted).
 * - Unregisters the device when the user logs out.
 * - Listens for `push.statusChanged` events (e.g. user grants notification
 *   permission in Settings and returns to app) and auto-registers if the
 *   permission is now granted.
 *
 * Safe to call from non-native environments — all bridge calls are no-ops.
 */
export function usePushRegistration(isLoggedIn: boolean): void {
  const wasLoggedInRef = useRef(false);

  useEffect(() => {
    if (!hostBridge.isNative()) return;

    if (isLoggedIn && !wasLoggedInRef.current) {
      pushBridge.register().catch((err) =>
        console.warn('[Push] registration failed:', err),
      );
    }

    if (!isLoggedIn && wasLoggedInRef.current) {
      pushBridge.unregister().catch((err) =>
        console.warn('[Push] unregistration failed:', err),
      );
    }

    wasLoggedInRef.current = isLoggedIn;
  }, [isLoggedIn]);

  useEffect(() => {
    if (!hostBridge.isNative() || !isLoggedIn) return;

    const unsubscribe = pushBridge.onStatusChanged((payload) => {
      if (payload.permission === 'granted' && !payload.registered) {
        pushBridge.register().catch((err) =>
          console.warn('[Push] re-registration after permission change failed:', err),
        );
      }
    });

    return unsubscribe;
  }, [isLoggedIn]);
}
