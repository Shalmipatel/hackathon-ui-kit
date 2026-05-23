import { useCallback } from 'react';
import { useUserPreferencesStore } from './user-preferences-store';
import { getPreferenceRepository, getSystemSession } from '@/features/app/bootstrap/providers';
import { EVENTS, track, trackActionFailed } from '@/features/analytics';

const NAMESPACE = 'user';
const KEY = 'timezone';

export interface UseTimezoneResult {
  timezone: string;
  isLoading: boolean;
  error: string | null;
  updateTimezone: (timezone: string) => Promise<void>;
}

/**
 * Reads the current timezone from the store and exposes an update function.
 *
 * Initial load is handled once during bootstrap (see bootstrap/index.ts).
 * This hook is a pure consumer — it never triggers an API fetch on mount.
 */
export function useTimezone(): UseTimezoneResult {
  const { value: timezone, isLoading, error } = useUserPreferencesStore((s) => s.timezone);
  const setTimezone = useUserPreferencesStore((s) => s.setTimezone);
  const setLoading = useUserPreferencesStore((s) => s.setTimezoneLoading);
  const setError = useUserPreferencesStore((s) => s.setTimezoneError);

  const updateTimezone = useCallback(
    async (newTimezone: string) => {
      const previousTimezone = useUserPreferencesStore.getState().timezone.value;
      setTimezone(newTimezone);
      setLoading(true);
      setError(null);
      try {
        await getPreferenceRepository().set(NAMESPACE, KEY, newTimezone);
        await getSystemSession().execute({ type: 'update_timezone', timezone: newTimezone });
        if (previousTimezone !== newTimezone) {
          track(EVENTS.TIMEZONE_CHANGED, {
            from_tz: previousTimezone,
            to_tz: newTimezone,
          });
        }
      } catch (err) {
        console.error('[useTimezone] Failed to update timezone:', err);
        setError('Failed to save timezone');
        trackActionFailed({
          action_name: 'settings.timezone.update',
          err,
          surface: 'settings',
          is_recoverable: true,
        });
      } finally {
        setLoading(false);
      }
    },
    [setTimezone, setLoading, setError],
  );

  return { timezone, isLoading, error, updateTimezone };
}
