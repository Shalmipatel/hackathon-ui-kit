/**
 * Typed facade over the `permissions.*` and `app.openSettings` host-bridge
 * methods. Handles mic + camera permission lifecycle natively on iOS/Android;
 * on the web it falls back to the standard Permissions API.
 */

import { hostBridge } from '../core';

export type PermissionType = 'microphone' | 'camera';
export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

interface StatusParams {
  type: PermissionType;
}
interface StatusResult {
  status: PermissionStatus;
}
interface ChangedPayload {
  type: PermissionType;
  status: PermissionStatus;
}

const METHOD_GET_STATUS = 'permissions.getStatus';
const METHOD_REQUEST = 'permissions.request';
const METHOD_OPEN_SETTINGS = 'app.openSettings';
const TOPIC_CHANGED = 'permissions.changed';

/**
 * Web Permissions API fallback for non-native environments.
 * Maps `PermissionType` to the Web Permissions API name.
 */
function webPermissionName(type: PermissionType): PermissionName {
  return type === 'camera' ? 'camera' : 'microphone';
}

async function getStatusWeb(type: PermissionType): Promise<PermissionStatus> {
  if (typeof navigator === 'undefined' || !navigator.permissions) {
    return 'undetermined';
  }
  try {
    const result = await navigator.permissions.query({ name: webPermissionName(type) });
    if (result.state === 'granted') return 'granted';
    if (result.state === 'denied') return 'denied';
    return 'undetermined';
  } catch {
    return 'undetermined';
  }
}

export const permissionsBridge = {
  /**
   * Query the current permission status. On native, delegates to the OS
   * permission APIs; on web, uses `navigator.permissions.query`.
   */
  async getStatus(type: PermissionType): Promise<PermissionStatus> {
    if (!hostBridge.isNative()) return getStatusWeb(type);
    const res = await hostBridge.request<StatusParams, StatusResult>(
      METHOD_GET_STATUS,
      { type },
    );
    return res.status;
  },

  /**
   * Request the permission. On native, triggers the OS-level prompt. On web,
   * `getUserMedia` itself triggers the prompt — this returns the current
   * Permissions API state as a best-effort check.
   */
  async request(type: PermissionType): Promise<PermissionStatus> {
    if (!hostBridge.isNative()) return getStatusWeb(type);
    const res = await hostBridge.request<StatusParams, StatusResult>(
      METHOD_REQUEST,
      { type },
    );
    return res.status;
  },

  /** Open the OS settings page for this app (native-only; no-op on web). */
  async openSettings(): Promise<void> {
    if (!hostBridge.isNative()) return;
    await hostBridge.request(METHOD_OPEN_SETTINGS, {});
  },

  /**
   * Subscribe to permission-changed events emitted when the user returns
   * from OS Settings. Returns an unsubscribe function.
   */
  onChanged(handler: (payload: ChangedPayload) => void): () => void {
    return hostBridge.subscribe<ChangedPayload>(TOPIC_CHANGED, handler);
  },
};

export type PermissionsBridge = typeof permissionsBridge;
