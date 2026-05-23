import { useState, useEffect, useCallback } from 'react';
import { useUserPreferencesStore } from '@/features/settings/user-preferences-store';

interface WeatherData {
  temperature: number;
  weatherCode: number;
  description: string;
}

interface UseWeatherReturn {
  weather: WeatherData | null;
  loading: boolean;
}

const CACHE_KEY = 'neoclaw_weather';
const CACHE_TTL_MS = 15 * 60 * 1000;

const WEATHER_CODES: Record<number, string> = {
  0: 'Clear',
  1: 'Mostly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Foggy',
  48: 'Foggy',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  80: 'Rain showers',
  81: 'Rain showers',
  82: 'Heavy showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm',
  99: 'Thunderstorm',
};

async function fetchWeather(lat: number, lon: number): Promise<WeatherData> {
  const resp = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode&temperature_unit=fahrenheit`,
  );
  const json = await resp.json();
  const temp = Math.round(json.current.temperature_2m);
  const code = json.current.weathercode;
  const description = WEATHER_CODES[code] ?? 'Unknown';
  return { temperature: temp, weatherCode: code, description };
}

interface CachedWeather {
  data: WeatherData;
  timestamp: number;
  lat: number;
  lon: number;
}

/**
 * Reads lat/lon from the location preference store (populated by useLocation)
 * and fetches weather data with 15-minute caching.
 * No independent location detection — single source of truth.
 */
export function useWeather(): UseWeatherReturn {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const locationData = useUserPreferencesStore((s) => s.location.value);

  const fetchWeatherData = useCallback(async (skipCache: boolean = false) => {
    if (!locationData || !locationData.lat || !locationData.lon) {
      setLoading(false);
      return;
    }

    const { lat, lon } = locationData;

    if (!skipCache) {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          const parsed: CachedWeather = JSON.parse(cached);
          const locationMatch = parsed.lat === lat && parsed.lon === lon;
          if (Date.now() - parsed.timestamp < CACHE_TTL_MS && locationMatch) {
            setWeather(parsed.data);
            setLoading(false);
            return;
          }
        } catch { /* ignore corrupt cache */ }
      }
    }

    setLoading(true);

    try {
      const data = await fetchWeather(lat, lon);
      setWeather(data);
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        data,
        timestamp: Date.now(),
        lat,
        lon,
      } satisfies CachedWeather));
    } catch { /* fetch failed */ }
    setLoading(false);
  }, [locationData]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      await fetchWeatherData();
      if (cancelled) return;
    })();

    return () => { cancelled = true; };
  }, [fetchWeatherData]);

  return { weather, loading };
}
