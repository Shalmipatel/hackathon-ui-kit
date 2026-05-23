/**
 * `window.__nortonAgent` is installed synchronously by the native Norton Agent
 * wrapper (iOS/Android) as a `documentStart` user script — by the time any
 * page script runs, the bridge object is already in place. Use the
 * `@/providers/host-bridge` facade rather than touching this directly.
 */
import type {
  NortonAgentBridgeNative,
} from '@/providers/host-bridge/types';

declare global {
  interface Window {
    __nortonAgent?: NortonAgentBridgeNative;
  }
}

export {};
