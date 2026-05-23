/**
 * useSocialAccounts - Manages social account connections.
 *
 * Delegates to the ISocialClient provider registered at bootstrap,
 * keeping the hook free of transport concerns (auth, headers, fetch).
 *
 * OAuth connect opens a new tab synchronously (preserving the user
 * gesture so the browser's popup blocker won't intervene), then
 * navigates it to the authorization URL once the API responds.
 * Tab auto-close (WATCH_AND_CLOSE_TAB replacement) is deferred.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getSocialClient } from '@/features/app/bootstrap/providers';
import { AuthExpiredError } from '@/providers/transport';
import type { SocialPlatform, SocialAccount } from '@/types';

export type { SocialPlatform, SocialAccount };

const TAB_POLL_INTERVAL_MS = 500;

export interface UseSocialAccountsReturn {
  platforms: SocialPlatform[];
  loading: boolean;
  error: string | null;
  connect: (platformId: string) => Promise<void>;
  disconnect: (accountId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

function classifyError(err: unknown): string {
  if (err instanceof AuthExpiredError) return 'Session expired. Please sign in again.';
  if (err instanceof DOMException && err.name === 'AbortError') return 'Request timed out.';
  if (err instanceof TypeError) return 'Network error. Please check your connection.';
  if (err instanceof Error) return err.message;
  return 'An unexpected error occurred.';
}

export function useSocialAccounts(open: boolean): UseSocialAccountsReturn {
  // ═══ REACT BINDING ═══
  const [platforms, setPlatforms] = useState<SocialPlatform[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval>>();

  // ═══ ORCHESTRATION LOGIC (extractable to use case) ═══

  const fetchPlatforms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = getSocialClient();
      const result = await client.listPlatforms();
      setPlatforms(result);
    } catch (err) {
      setError(classifyError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const connectAccount = useCallback(async (platformId: string) => {
    setError(null);

    const tab = window.open('about:blank', '_blank');
    if (!tab) {
      setError('Popup was blocked. Please allow popups for this site.');
      return;
    }

    try {
      const client = getSocialClient();
      const url = await client.getConnectUrl(platformId);
      tab.location.href = url;

      clearInterval(pollTimerRef.current);
      pollTimerRef.current = setInterval(() => {
        if (tab.closed) {
          clearInterval(pollTimerRef.current);
          fetchPlatforms();
        }
      }, TAB_POLL_INTERVAL_MS);
    } catch (err) {
      tab.close();
      setError(classifyError(err));
    }
  }, [fetchPlatforms]);

  const removeAccount = useCallback(async (accountId: string) => {
    setError(null);
    try {
      const client = getSocialClient();
      await client.disconnect(accountId);
      await fetchPlatforms();
    } catch (err) {
      setError(classifyError(err));
    }
  }, [fetchPlatforms]);

  // ═══ EFFECTS ═══

  useEffect(() => {
    if (open) {
      fetchPlatforms();
    }
  }, [open, fetchPlatforms]);

  useEffect(() => {
    return () => {
      clearInterval(pollTimerRef.current);
    };
  }, []);

  // ═══ PUBLIC API ═══

  return {
    platforms,
    loading,
    error,
    connect: connectAccount,
    disconnect: removeAccount,
    refresh: fetchPlatforms,
  };
}
