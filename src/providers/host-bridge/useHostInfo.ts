/**
 * React hook returning a stable snapshot of the native host info, plus a
 * convenience `isNative` flag.
 *
 * Because the native shell injects `window.__nortonAgent` synchronously at
 * `documentStart`, this hook returns the correct value on the very first
 * render — no loading state, no flash of "browser-only" UI.
 */

import { useMemo } from 'react';
import { hostBridge } from './core';
import type { HostInfo, HostPlatform } from './types';

export interface HostInfoSnapshot {
  isNative: boolean;
  platform: HostPlatform | 'web';
  info: HostInfo | null;
  /** Capability check helper, bound to the current native bridge. */
  supports: (method: string) => boolean;
}

export function useHostInfo(): HostInfoSnapshot {
  // Identity is stable for the lifetime of the page — the native shell
  // doesn't swap `window.__nortonAgent` once installed. Memoising avoids
  // shallow-equality re-renders in consumers that pass this through context.
  return useMemo<HostInfoSnapshot>(
    () => ({
      isNative: hostBridge.isNative(),
      platform: hostBridge.platform(),
      info: hostBridge.info(),
      supports: hostBridge.supports,
    }),
    [],
  );
}
