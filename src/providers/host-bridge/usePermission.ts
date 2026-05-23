/**
 * React hook for OS-level permission state. Returns the current status plus
 * imperative `request()` and `openSettings()` helpers. Automatically
 * refreshes when the native side emits a `permissions.changed` event
 * (e.g. after the user toggles the toggle in Settings and returns to the app).
 *
 * On the web (non-native) the hook falls through to `navigator.permissions`
 * so callers don't need to branch on platform.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  permissionsBridge,
  type PermissionStatus,
  type PermissionType,
} from './features/permissions';

export interface UsePermissionResult {
  /** Current permission status — `null` while the initial async check is pending. */
  status: PermissionStatus | null;
  /** Trigger the OS-level permission prompt (or re-check on web). */
  request: () => Promise<PermissionStatus>;
  /** Open the OS app-settings page so the user can toggle the permission. */
  openSettings: () => Promise<void>;
}

export function usePermission(type: PermissionType): UsePermissionResult {
  const [status, setStatus] = useState<PermissionStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    permissionsBridge.getStatus(type).then((s) => {
      if (!cancelled) setStatus(s);
    });

    const unsub = permissionsBridge.onChanged((payload) => {
      if (payload.type === type) setStatus(payload.status);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [type]);

  const request = useCallback(async () => {
    const result = await permissionsBridge.request(type);
    setStatus(result);
    return result;
  }, [type]);

  const openSettings = useCallback(() => permissionsBridge.openSettings(), []);

  return { status, request, openSettings };
}
