/**
 * Typed facade over the `browser.*` host-bridge namespace.
 *
 * `browser.openExternal` hands a URL to the system browser, leaving the app
 * entirely (e.g. "Open in Google Calendar"). On the web (non-native) it falls
 * back to `window.open`.
 */

import { hostBridge } from '../core';

const METHOD_OPEN_EXTERNAL = 'browser.openExternal';

interface OpenExternalParams {
  url: string;
}

export const browserBridge = {
  /**
   * Open `url` in the device's external browser. On native this hands the URL
   * to the OS (Chrome / Safari); on the web it falls back to `window.open`.
   */
  async openExternal(url: string): Promise<void> {
    if (!hostBridge.isNative()) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    await hostBridge.request<OpenExternalParams, void>(METHOD_OPEN_EXTERNAL, { url });
  },
};

export type BrowserBridge = typeof browserBridge;
