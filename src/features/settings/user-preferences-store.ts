import { create } from 'zustand';
import type { LocationData } from '@/core/utils';

export interface PreferenceEntry<T> {
  value: T;
  isLoading: boolean;
  error: string | null;
}

function preferenceEntry<T>(value: T): PreferenceEntry<T> {
  return { value, isLoading: false, error: null };
}

interface UserPreferencesState {
  timezone: PreferenceEntry<string>;
  location: PreferenceEntry<LocationData | null>;
  analyticsOptOut: PreferenceEntry<boolean>;

  setTimezone: (value: string) => void;
  setTimezoneLoading: (loading: boolean) => void;
  setTimezoneError: (error: string | null) => void;

  setLocation: (value: LocationData | null) => void;
  setLocationLoading: (loading: boolean) => void;
  setLocationError: (error: string | null) => void;

  setAnalyticsOptOut: (value: boolean) => void;
  setAnalyticsOptOutLoading: (loading: boolean) => void;
  setAnalyticsOptOutError: (error: string | null) => void;
}

export const useUserPreferencesStore = create<UserPreferencesState>()((set) => ({
  timezone: preferenceEntry(''),
  location: preferenceEntry<LocationData | null>(null),
  analyticsOptOut: preferenceEntry(false),

  setTimezone: (value) =>
    set((s) => ({ timezone: { ...s.timezone, value } })),

  setTimezoneLoading: (isLoading) =>
    set((s) => ({ timezone: { ...s.timezone, isLoading } })),

  setTimezoneError: (error) =>
    set((s) => ({ timezone: { ...s.timezone, error } })),

  setLocation: (value) =>
    set((s) => ({ location: { ...s.location, value } })),

  setLocationLoading: (isLoading) =>
    set((s) => ({ location: { ...s.location, isLoading } })),

  setLocationError: (error) =>
    set((s) => ({ location: { ...s.location, error } })),

  setAnalyticsOptOut: (value) =>
    set((s) => ({ analyticsOptOut: { ...s.analyticsOptOut, value } })),

  setAnalyticsOptOutLoading: (isLoading) =>
    set((s) => ({ analyticsOptOut: { ...s.analyticsOptOut, isLoading } })),

  setAnalyticsOptOutError: (error) =>
    set((s) => ({ analyticsOptOut: { ...s.analyticsOptOut, error } })),
}));
