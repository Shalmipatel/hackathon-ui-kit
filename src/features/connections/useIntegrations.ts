/**
 * useIntegrations - Manages a single identity-server integration provider.
 *
 * Accepts a `provider` string (e.g. "Gmail", "Gcal") so the same hook
 * can drive separate UI cards for different Google services.
 *
 * Web (popup) connect flow:
 *   1. Opens a popup to your integration-relay page
 *      (`<relay-host>/integration-relay?provider=…`)
 *   2. The relay page posts 'relay-ready' back via postMessage
 *   3. This hook responds with the JWT via postMessage
 *   4. The relay sets a short-lived auth cookie and navigates to the
 *      gateway's /api/integration/{provider}/connect endpoint
 *   5. The gateway proxies to your identity server, which 302-redirects
 *      to OAuth
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getIntegrationClient, getAuthProvider } from '@/features/app/bootstrap/providers';
import { getDefaultConfig } from '@/features/app/config/config-loader';
import { AuthExpiredError } from '@/providers/transport';
import type { IntegrationService, ConnectedAccount } from '@/types';
import { authBridge, hostBridge } from '@/providers/host-bridge';

export type { IntegrationService };

const TAB_POLL_INTERVAL_MS = 500;
const STATUS_POLL_INTERVAL_MS = 2000;
const POPUP_FEATURES = 'width=500,height=700,popup=yes';

/**
 * Shape returned by `connect()`. `newAccount` is the freshly-authorized
 * account when we can confidently identify which account was just added
 * (by diffing the pre-popup account ids against post-popup ids). Absent
 * when the popup was closed without a detectable new account — e.g. the
 * user cancelled, or re-authorized an account that was already there.
 */
export interface ConnectResult {
  connected: boolean;
  newAccount?: ConnectedAccount;
}

export interface UseIntegrationsReturn {
  services: IntegrationService[];
  loading: boolean;
  error: string | null;
  /**
   * Opens the OAuth popup. Resolves with `{ connected: true, newAccount }`
   * if a new account was authorized, or `{ connected: false }` otherwise.
   */
  connect: () => Promise<ConnectResult>;
  disconnect: (accountId: string) => Promise<void>;
  refreshStatus: () => Promise<void>;
  isServiceConnected: (serviceKey: string) => boolean;
}

function classifyError(err: unknown): string {
  if (err instanceof AuthExpiredError) return 'Session expired. Please sign in again.';
  if (err instanceof DOMException && err.name === 'AbortError') return 'Request timed out.';
  if (err instanceof TypeError) return 'Network error. Please check your connection.';
  if (err instanceof Error) return err.message;
  return 'An unexpected error occurred.';
}

/**
 * Connect via the Norton Agent native host.
 *
 * We can't reuse the popup path because the embedded WebView has no way to
 * open a real browser window, and Google refuses OAuth inside a WebView.
 * Instead we tuck the JWT into the relay URL's fragment (safer than a query
 * param — fragments never hit server logs), hand the URL to the native
 * host, and poll /status just like the popup flow does. When a new account
 * appears we ask the host to dismiss Safari.
 */
async function connectViaNativeHost(
  provider: string,
  connectPath: string,
  setError: (message: string | null) => void,
  setServices: (services: IntegrationService[]) => void,
): Promise<ConnectResult> {
  let token: string | null = null;
  try {
    token = await getAuthProvider().getAccessToken();
  } catch {
    setError('Failed to obtain access token.');
    return { connected: false };
  }
  if (!token) {
    setError('Session expired. Please sign in again.');
    return { connected: false };
  }

  let relayUrl: string;
  try {
    const url = new URL(connectPath);
    url.hash = `mobile=1&token=${encodeURIComponent(token)}`;
    relayUrl = url.toString();
  } catch {
    setError('Invalid integration endpoint.');
    return { connected: false };
  }

  const client = getIntegrationClient();
  const initialAccountIds = new Set<string>();
  try {
    const current = await client.listServices(provider);
    for (const s of current) {
      for (const a of s.accounts) {
        if (a.isConnected) initialAccountIds.add(a.accountId);
      }
    }
  } catch { /* fall through — we'll treat any connected account as new */ }

  try {
    await authBridge.openIntegration(relayUrl);
  } catch {
    setError('Unable to open the authentication window.');
    return { connected: false };
  }

  const startedAt = Date.now();
  const TIMEOUT_MS = 5 * 60 * 1000;

  return new Promise<ConnectResult>((resolve) => {
    let settled = false;
    let unsubCancelled: (() => void) | null = null;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      unsubCancelled?.();
      unsubCancelled = null;
    };

    unsubCancelled = authBridge.onCancelled(() => {
      cleanup();
      resolve({ connected: false });
    });

    const poll = setInterval(async () => {
      if (settled) return;
      if (Date.now() - startedAt > TIMEOUT_MS) {
        cleanup();
        authBridge.dismissIntegration().catch(() => { /* ignore */ });
        resolve({ connected: false });
        return;
      }
      try {
        const result = await client.listServices(provider);
        const connectedAccounts = result
          .flatMap((s) => s.accounts)
          .filter((a) => a.isConnected);
        const newAccount = connectedAccounts.find(
          (a) => !initialAccountIds.has(a.accountId),
        );
        if (newAccount) {
          cleanup();
          setServices(result);
          client.invalidateTokenCache();
          authBridge.dismissIntegration().catch(() => { /* ignore */ });
          resolve({ connected: true, newAccount });
        }
      } catch { /* transient — keep polling */ }
    }, STATUS_POLL_INTERVAL_MS);
  });
}

export function useIntegrations(open: boolean, provider: string): UseIntegrationsReturn {
  const [services, setServices] = useState<IntegrationService[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval>>();
  const popupRef = useRef<Window | null>(null);
  const focusHandlerRef = useRef<(() => void) | null>(null);

  const cleanupPopupListeners = useCallback(() => {
    if (focusHandlerRef.current) {
      window.removeEventListener('focus', focusHandlerRef.current);
      focusHandlerRef.current = null;
    }
    clearInterval(pollTimerRef.current);
    pollTimerRef.current = undefined;
  }, []);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = getIntegrationClient();
      const result = await client.listServices(provider);
      setServices(result);
    } catch (err) {
      setError(classifyError(err));
    } finally {
      setLoading(false);
    }
  }, [provider]);

  const connectIntegration = useCallback(() => {
    setError(null);
    cleanupPopupListeners();

    const connectPath = getIntegrationClient().getConnectPath(provider);

    /* Starter-kit guard: `getConnectPath` returns an absolute URL like
     * `https://<gateway>/integration-relay?...` once a backend is wired,
     * but degenerates to a bare `/integration-relay?...` when the
     * identity callback host is empty. In that case opening the popup
     * just reloads the SPA at a route it doesn't know — looking to the
     * user like the button does nothing. Short-circuit with a clear
     * message instead of pretending to start an OAuth flow. */
    if (!/^https?:\/\//.test(connectPath)) {
      const msg =
        `${provider} can't be connected yet — this starter kit has no ` +
        'backend wired up.\n\nSet `VITE_NEOCLAW_API_URL` and ' +
        '`VITE_NEOCLAW_API_KEY` in `.env.local`, then restart ' +
        '`npm run dev` to enable the real Connect flow.';
      setError(msg);
      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert(msg);
      }
      return Promise.resolve<ConnectResult>({ connected: false });
    }

    if (hostBridge.isNative()) {
      return connectViaNativeHost(provider, connectPath, setError, setServices);
    }

    const popup = window.open(connectPath, `neoclaw-integration-${provider}`, POPUP_FEATURES);
    if (!popup) {
      setError('Popup was blocked. Please allow popups for this site.');
      return Promise.resolve<ConnectResult>({ connected: false });
    }
    popupRef.current = popup;

    const relayTargetOrigin = getDefaultConfig().api.identity.callbackBaseUrl;

    return new Promise<ConnectResult>(async (resolve) => {
      let resolved = false;
      /*
       * Captured by the poll loop below when it detects a new accountId
       * appear after OAuth. Surfaced to the caller via `ConnectResult`
       * so analytics can record which email was just linked without
       * re-fetching the integrations list themselves.
       */
      let capturedNewAccount: ConnectedAccount | undefined;
      const finish = async (connected?: boolean) => {
        if (resolved) return;
        resolved = true;
        cleanupPopupListeners();
        window.removeEventListener('message', onMessage);
        clearInterval(statusPollTimer);
        if (popupRef.current && !popupRef.current.closed) {
          try { popupRef.current.close(); } catch { /* cross-origin */ }
        }
        popupRef.current = null;
        getIntegrationClient().invalidateTokenCache();
        if (connected !== undefined) {
          resolve({ connected, newAccount: capturedNewAccount });
          return;
        }
        try {
          const client = getIntegrationClient();
          const result = await client.listServices(provider);
          setServices(result);
          const connectedAccounts = result
            .flatMap((s) => s.accounts)
            .filter((a) => a.isConnected);
          const isConnected = connectedAccounts.length > 0;
          // Popup-close fallback path: still try to identify a new account
          // by diffing against the pre-popup snapshot, so we don't lose
          // the email just because the OAuth redirect didn't postMessage.
          const fallbackNewAccount =
            capturedNewAccount ??
            connectedAccounts.find((a) => !initialAccountIds.has(a.accountId));
          resolve({ connected: isConnected, newAccount: fallbackNewAccount });
        } catch {
          resolve({ connected: false, newAccount: capturedNewAccount });
        }
      };

      const onMessage = async (event: MessageEvent) => {
        // Relay page signals it is ready to receive the JWT
        if (event.data?.type === 'relay-ready') {
          try {
            const token = await getAuthProvider().getAccessToken();
            if (!token) {
              setError('Session expired. Please sign in again.');
              finish(false);
              return;
            }
            popup.postMessage({ type: 'integration-auth', token }, relayTargetOrigin);
          } catch {
            setError('Failed to obtain access token.');
            finish(false);
          }
          return;
        }

        // OAuth success page (after the full redirect chain) may signal completion
        if (event.data?.type === 'integration-connected') {
          finish();
        }
      };
      window.addEventListener('message', onMessage);

      // Snapshot current accounts to detect new connections or re-auth
      const initialAccountIds = new Set<string>();
      const initialTimestamp = Date.now();
      try {
        const client = getIntegrationClient();
        const current = await client.listServices(provider);
        for (const s of current) {
          for (const a of s.accounts) {
            if (a.isConnected) initialAccountIds.add(a.accountId);
          }
        }
      } catch { /* ignore */ }

      // Poll integration status API to detect new accounts
      const statusPollTimer = setInterval(async () => {
        try {
          const client = getIntegrationClient();
          const result = await client.listServices(provider);
          const currentIds = new Set<string>();
          for (const s of result) {
            for (const a of s.accounts) {
              if (a.isConnected) currentIds.add(a.accountId);
            }
          }
          if ([...currentIds].some((id) => !initialAccountIds.has(id))) {
            setServices(result);
            capturedNewAccount = result
              .flatMap((s) => s.accounts)
              .find((a) => a.isConnected && !initialAccountIds.has(a.accountId));
            finish(true);
          }
        } catch { /* ignore */ }
      }, STATUS_POLL_INTERVAL_MS);

      // Close popup when parent regains focus (but only after enough time
      // for OAuth to complete, to avoid killing the popup mid-auth)
      const onWindowFocus = () => {
        if (Date.now() - initialTimestamp < 5000) return;
        if (popupRef.current && !popupRef.current.closed) {
          try { popupRef.current.close(); } catch { /* cross-origin */ }
        }
      };
      focusHandlerRef.current = onWindowFocus;
      window.addEventListener('focus', onWindowFocus);

      // Poll for popup close (catches manual close, window.close(), and focus-triggered close)
      pollTimerRef.current = setInterval(async () => {
        if (popup.closed) {
          clearInterval(statusPollTimer);
          finish();
        }
      }, TAB_POLL_INTERVAL_MS);
    });
  }, [provider, cleanupPopupListeners]);

  const removeIntegration = useCallback(async (accountId: string) => {
    setError(null);
    try {
      const client = getIntegrationClient();
      await client.disconnect(provider, accountId);
      await fetchStatus();
    } catch (err) {
      setError(classifyError(err));
    }
  }, [provider, fetchStatus]);

  const isServiceConnected = useCallback(
    (serviceKey: string) =>
      services.some((s) => s.key === serviceKey && s.accounts.some((a) => a.isConnected)),
    [services],
  );

  useEffect(() => {
    if (open) {
      fetchStatus();
    }
  }, [open, fetchStatus]);

  useEffect(() => {
    return () => {
      cleanupPopupListeners();
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }
    };
  }, [cleanupPopupListeners]);

  return {
    services,
    loading,
    error,
    connect: connectIntegration,
    disconnect: removeIntegration,
    refreshStatus: fetchStatus,
    isServiceConnected,
  };
}
