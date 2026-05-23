/**
 * Thin back-compat shim that re-exports the generic host-bridge facade for
 * call-sites still using `getNortonAgent()` / `isMobileHost()`. New code
 * should import from `@/providers/host-bridge` directly.
 *
 * The analytics-wrapped helpers (`openIntegrationAuth`, `notifyIntegrationDone`,
 * `openExternalUrl`) are preserved here so existing callers (calendar, settings)
 * keep working. They delegate to `@/providers/host-bridge` facades internally.
 *
 * Marked deprecated to nudge migration; remove once no callers remain.
 */

import { hostBridge, authBridge, browserBridge, type NortonAgentBridgeNative } from '@/providers/host-bridge';
import { EVENTS, track } from '@/features/analytics';

/**
 * @deprecated Use `hostBridge.isNative()` from `@/providers/host-bridge`.
 */
export function getNortonAgent(): NortonAgentBridgeNative | null {
  if (typeof window === 'undefined') return null;
  return window.__nortonAgent ?? null;
}

/**
 * @deprecated Use `hostBridge.isNative()` from `@/providers/host-bridge`.
 */
export function isMobileHost(): boolean {
  return hostBridge.isNative();
}

/**
 * Open `url` in the system browser, escaping the embedded WebView.
 *
 * On native this delegates to `browserBridge.openExternal`; on web it falls
 * back to `window.open`. Intentionally NOT analytics-wrapped because it
 * isn't tied to a funnel step.
 *
 * @deprecated Use `browserBridge.openExternal()` from `@/providers/host-bridge`.
 */
export function openExternalUrl(url: string): boolean {
  if (!url) return false;
  try {
    browserBridge.openExternal(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Open an OAuth integration URL via the native shell's system browser.
 * Fires `Native Bridge Called` and `External Browser Opened` analytics events.
 *
 * @deprecated Use `authBridge.openIntegration()` from `@/providers/host-bridge`.
 */
export function openIntegrationAuth(url: string): boolean {
  if (!hostBridge.isNative()) return false;
  try {
    track(EVENTS.NATIVE_BRIDGE_CALLED, { bridge_method: 'openIntegrationAuth' });
    let targetHost = '';
    try { targetHost = new URL(url).host; } catch { /* malformed URL */ }
    track(EVENTS.EXTERNAL_BROWSER_OPENED, {
      platform: hostBridge.platform(),
      target_host: targetHost,
    });
    authBridge.openIntegration(url);
    return true;
  } catch (err) {
    track(EVENTS.NATIVE_BRIDGE_FAILED, {
      bridge_method: 'openIntegrationAuth',
      error_code: err instanceof Error ? err.name : 'unknown',
    });
    return false;
  }
}

/**
 * Dismiss the system browser presented by the native shell, if any.
 *
 * @deprecated Use `authBridge.dismissIntegration()` from `@/providers/host-bridge`.
 */
export function notifyIntegrationDone(): void {
  if (!hostBridge.isNative()) return;
  try {
    track(EVENTS.NATIVE_BRIDGE_CALLED, { bridge_method: 'onIntegrationDone' });
    authBridge.dismissIntegration();
  } catch (err) {
    track(EVENTS.NATIVE_BRIDGE_FAILED, {
      bridge_method: 'onIntegrationDone',
      error_code: err instanceof Error ? err.name : 'unknown',
    });
  }
}
