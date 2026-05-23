/**
 * Typed facade over the `push.*` host-bridge methods.
 * Handles device registration / unregistration with the notification-service
 * backend via the native shell. On web (no native host) every method is a
 * no-op so callers don't need platform checks.
 */

import { hostBridge } from '../core';
import { SessionClient } from '../../auth/session-client';

export type PushPermission = 'granted' | 'denied' | 'undetermined';

export interface PushStatusResult {
  permission: PushPermission;
  registered: boolean;
}

interface RegisterResult {
  status: 'registered' | 'updated' | 'no_change' | 'no_permission';
}

const METHOD_REGISTER = 'push.register';
const METHOD_UNREGISTER = 'push.unregister';
const METHOD_GET_STATUS = 'push.getStatus';
const METHOD_REQUEST_PERMISSION = 'push.requestPermission';
const TOPIC_STATUS_CHANGED = 'push.statusChanged';

const sessionClient = new SessionClient();

export const pushBridge = {
  /**
   * Register the device for push notifications. Fetches a JWT from the
   * session endpoint and passes it to the native shell, which calls the
   * notification-service backend.
   *
   * No-op when not running inside a native host or when no JWT is available.
   */
  async register(): Promise<RegisterResult | null> {
    if (!hostBridge.isNative()) return null;
    const jwt = await sessionClient.fetchToken();
    if (!jwt) return null;
    return hostBridge.request<{ jwt: string }, RegisterResult>(METHOD_REGISTER, { jwt });
  },

  /**
   * Unregister the device from push notifications. Fetches a JWT and tells
   * the native shell to call DELETE on the notification-service backend.
   */
  async unregister(): Promise<void> {
    if (!hostBridge.isNative()) return;
    const jwt = await sessionClient.fetchToken();
    if (!jwt) return;
    await hostBridge.request<{ jwt: string }, void>(METHOD_UNREGISTER, { jwt });
  },

  /** Query the current push notification status from the native side. */
  async getStatus(): Promise<PushStatusResult | null> {
    if (!hostBridge.isNative()) return null;
    return hostBridge.request<Record<string, never>, PushStatusResult>(METHOD_GET_STATUS);
  },

  /**
   * Trigger the OS-level notification permission prompt. For first-time users
   * (undetermined) this shows the iOS system dialog. Returns the resulting
   * permission status. No-op on web.
   */
  async requestPermission(): Promise<PushPermission | null> {
    if (!hostBridge.isNative()) return null;
    const res = await hostBridge.request<
      Record<string, never>,
      { permission: PushPermission }
    >(METHOD_REQUEST_PERMISSION, {});
    return res.permission;
  },

  /**
   * Subscribe to push status changes emitted by the native side when the
   * user toggles notification permission in iOS Settings and returns to the
   * app. Returns an unsubscribe function.
   */
  onStatusChanged(handler: (payload: PushStatusResult) => void): () => void {
    return hostBridge.subscribe<PushStatusResult>(TOPIC_STATUS_CHANGED, handler);
  },
};

export type PushBridge = typeof pushBridge;
