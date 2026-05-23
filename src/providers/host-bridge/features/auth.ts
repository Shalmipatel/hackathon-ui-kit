/**
 * Typed facade over the `auth.*` host-bridge namespace.
 *
 * Replaces the legacy `window.__nortonAgent.openIntegrationAuth(url)` /
 * `onIntegrationDone()` calls. The legacy shape still works (the native shim
 * wraps these methods) but new code should import from this module instead.
 */

import { hostBridge } from '../core';

const METHOD_OPEN = 'auth.openIntegration';
const METHOD_DISMISS = 'auth.dismissIntegration';
const TOPIC_CANCELLED = 'auth.cancelled';

export interface OpenIntegrationParams {
  /** Absolute https URL on the integration relay, with the JWT in the fragment. */
  url: string;
}

export const authBridge = {
  /**
   * Open `url` in the system in-app browser hosted by the native shell.
   * Returns once the native side has scheduled the presentation; completion
   * is surfaced via `onCancelled` (user dismissed) or via the caller's own
   * status polling (success).
   */
  openIntegration(url: string): Promise<void> {
    return hostBridge.request<OpenIntegrationParams, void>(METHOD_OPEN, { url });
  },

  /** Programmatically dismiss the in-app browser, e.g. once the link is detected. */
  dismissIntegration(): Promise<void> {
    return hostBridge.request<Record<string, never>, void>(METHOD_DISMISS, {});
  },

  /**
   * Subscribe to user-cancelled events from the in-app browser. Returns an
   * unsubscribe function. Safe to call from a `useEffect` — when running in
   * the regular web app the subscription is a no-op.
   */
  onCancelled(handler: () => void): () => void {
    return hostBridge.subscribe<unknown>(TOPIC_CANCELLED, () => handler());
  },
};

export type AuthBridge = typeof authBridge;
