import type { LocationData } from './ip-location';

const GEOLOCATION_TIMEOUT_MS = 10000;

/**
 * Detects user location via the browser Geolocation API.
 * Pure I/O — wraps navigator.geolocation.getCurrentPosition in a Promise.
 * Returns LocationData with empty city/country (coordinates only).
 * Returns null if geolocation is unavailable, denied, or times out.
 */
export function detectBrowserLocation(): Promise<LocationData | null> {
  try {
    if (!navigator.geolocation) {
      console.log('[detectBrowserLocation] navigator.geolocation not available');
      return Promise.resolve(null);
    }

    console.log('[detectBrowserLocation] Requesting position...');

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log('[detectBrowserLocation] Success:', position.coords.latitude, position.coords.longitude);
          resolve({
            city: '',
            country: '',
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          });
        },
        (error) => {
          console.log('[detectBrowserLocation] Error:', error.code, error.message);
          resolve(null);
        },
        { timeout: GEOLOCATION_TIMEOUT_MS, enableHighAccuracy: false, maximumAge: 300000 },
      );
    });
  } catch (err) {
    console.log('[detectBrowserLocation] Exception:', err);
    return Promise.resolve(null);
  }
}
