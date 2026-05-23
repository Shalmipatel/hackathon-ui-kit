export interface LocationData {
  city: string;
  country: string;
  lat: number;
  lon: number;
}

/**
 * Detects user location by IP using ipapi.co.
 * Pure I/O — fetches and maps response to LocationData.
 * Returns null on failure.
 */
export async function detectLocationByIP(): Promise<LocationData | null> {
  try {
    const resp = await fetch('https://ipapi.co/json/', {
      signal: AbortSignal.timeout(5000),
    });

    if (!resp.ok) {
      return null;
    }

    const json = await resp.json();

    const lat = json.latitude as number | undefined;
    const lon = json.longitude as number | undefined;

    if (!lat || !lon) {
      return null;
    }

    return {
      city: (json.city as string) ?? '',
      country: (json.country_name as string) ?? '',
      lat,
      lon,
    };
  } catch {
    return null;
  }
}

/**
 * Geocodes a city name to coordinates using Open-Meteo geocoding API.
 * Used when the user selects a city from the Settings dropdown.
 */
export async function geocodeCity(cityName: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const resp = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1`,
      { signal: AbortSignal.timeout(5000) },
    );

    if (!resp.ok) return null;

    const json = await resp.json();
    if (json.results && json.results.length > 0) {
      return { lat: json.results[0].latitude, lon: json.results[0].longitude };
    }
  } catch { /* geocoding failed */ }
  return null;
}

export function formatLocationLabel(location: LocationData | null): string {
  if (!location) return '';
  if (location.city && location.country) return `${location.city}, ${location.country}`;
  if (location.country) return location.country;
  return '';
}
