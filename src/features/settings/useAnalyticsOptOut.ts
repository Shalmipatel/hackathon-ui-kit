import { useCallback } from 'react';
import { useUserPreferencesStore } from './user-preferences-store';
import { getPreferenceRepository } from '@/features/app/bootstrap/providers';
import { applyAnalyticsOptOut, trackActionFailed } from '@/features/analytics';

const NAMESPACE = 'privacy';
const KEY = 'analytics_opt_out';

export interface UseAnalyticsOptOutResult {
  optedOut: boolean;
  isLoading: boolean;
  error: string | null;
  setOptedOut: (value: boolean) => Promise<void>;
}

/**
 * Reads the current analytics opt-out state from the store and exposes
 * an update function.
 *
 * Initial load is handled once during postConnectionReady (see
 * bootstrap/post-connection-ready.ts). This hook is a pure consumer —
 * it never triggers an API fetch on mount.
 */
export function useAnalyticsOptOut(): UseAnalyticsOptOutResult {
  const { value: optedOut, isLoading, error } = useUserPreferencesStore((s) => s.analyticsOptOut);
  const setAnalyticsOptOut = useUserPreferencesStore((s) => s.setAnalyticsOptOut);
  const setLoading = useUserPreferencesStore((s) => s.setAnalyticsOptOutLoading);
  const setError = useUserPreferencesStore((s) => s.setAnalyticsOptOutError);

  const setOptedOut = useCallback(
    async (value: boolean) => {
      const previous = useUserPreferencesStore.getState().analyticsOptOut.value;
      setAnalyticsOptOut(value);
      applyAnalyticsOptOut(value);
      setLoading(true);
      setError(null);
      try {
        await getPreferenceRepository().set(NAMESPACE, KEY, value, 'boolean');
      } catch (err) {
        console.error('[useAnalyticsOptOut] Failed to save preference:', err);
        setAnalyticsOptOut(previous);
        applyAnalyticsOptOut(previous);
        setError('Failed to save privacy settings');
        trackActionFailed({
          action_name: 'settings.analytics_opt_out.update',
          err,
          surface: 'settings',
          is_recoverable: true,
        });
      } finally {
        setLoading(false);
      }
    },
    [setAnalyticsOptOut, setLoading, setError],
  );

  return { optedOut, isLoading, error, setOptedOut };
}
