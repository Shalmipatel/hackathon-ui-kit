import { useCallback, useEffect, useRef } from 'react';
import { useUserPreferencesStore } from './user-preferences-store';
import { getPreferenceRepository, getSystemSession } from '@/features/app/bootstrap/providers';
import { detectBrowserLocation, detectLocationByIP, formatLocationLabel } from '@/core/utils';
import type { LocationData } from '@/core/utils';

const NAMESPACE = 'user';
const KEY = 'location';

export interface UseLocationResult {
  location: LocationData | null;
  isLoading: boolean;
  error: string | null;
  updateLocation: (location: LocationData) => Promise<void>;
}

/**
 * Manages location preference with a prioritized detection flow:
 *   1. Load saved LocationData from PreferenceRepository
 *   2. If none saved, detect via browser Geolocation API
 *   3. If browser unavailable/denied, fallback to ipapi.co
 *   Whichever succeeds is persisted immediately.
 *
 * @param enabled - Guards detection; pass false to defer until auth/onboarding complete.
 *                  Defaults to true for consumers that only read state (e.g. SettingsView).
 *
 * Called at app level (TabPage) for initialization and in SettingsView
 * for user-driven updates.
 */
export function useLocation(enabled: boolean = true): UseLocationResult {
  const { value: location, isLoading, error } = useUserPreferencesStore((s) => s.location);
  const setLocation = useUserPreferencesStore((s) => s.setLocation);
  const setLoading = useUserPreferencesStore((s) => s.setLocationLoading);
  const setError = useUserPreferencesStore((s) => s.setLocationError);

  const hasLoaded = useRef(false);

  useEffect(() => {
    if (!enabled || hasLoaded.current) return;
    hasLoaded.current = true;

    setLoading(true);

    (async () => {
      try {
        const saved = await getPreferenceRepository().get<LocationData>(NAMESPACE, KEY);
        if (saved && saved.lat && saved.lon) {
          setLocation(saved);
        } else {
          const browserDetected = await detectBrowserLocation();
          if (browserDetected) {
            setLocation(browserDetected);
            await getPreferenceRepository().set(NAMESPACE, KEY, browserDetected, 'json');
          } else {
            const ipDetected = await detectLocationByIP();
            if (ipDetected) {
              setLocation(ipDetected);
              await getPreferenceRepository().set(NAMESPACE, KEY, ipDetected, 'json');
            }
          }
        }
      } catch {
        setError('Could not load saved location');
      } finally {
        setLoading(false);
      }
    })();
  }, [enabled, setLocation, setLoading, setError]);

  const updateLocation = useCallback(
    async (newLocation: LocationData) => {
      setLocation(newLocation);
      setLoading(true);
      setError(null);
      try {
        await getPreferenceRepository().set(NAMESPACE, KEY, newLocation, 'json');
        const label = formatLocationLabel(newLocation);
        if (label) {
          await getSystemSession().execute({ type: 'update_location', location: label });
        }
      } catch (err) {
        console.error('[useLocation] Failed to update location:', err);
        setError('Failed to save location');
      } finally {
        setLoading(false);
      }
    },
    [setLocation, setLoading, setError],
  );

  return { location, isLoading, error, updateLocation };
}
