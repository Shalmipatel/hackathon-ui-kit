import type { IStorageProvider } from '@/types';
import { StorageQuotaError } from './storage-errors';

/**
 * Web-native storage provider backed by window.localStorage.
 * Suited for small, frequently-read data: settings, flags, onboarding state.
 *
 * localStorage is synchronous and memory-mapped by the browser,
 * so all methods resolve immediately. The async interface is maintained
 * for compatibility with IStorageProvider.
 */
export class LocalStorageProvider implements IStorageProvider {
  async get<T>(key: string, defaultValue: T): Promise<T> {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return defaultValue;
      return JSON.parse(raw) as T;
    } catch (err) {
      console.warn(`[LocalStorageProvider] Failed to read key "${key}", returning default`, err);
      return defaultValue;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      localStorage.setItem(key, serialized);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'QuotaExceededError') {
        throw new StorageQuotaError(key, err);
      }
      throw err;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      localStorage.removeItem(key);
    } catch (err) {
      console.warn(`[LocalStorageProvider] Failed to remove key "${key}"`, err);
    }
  }

  async clear(): Promise<void> {
    try {
      localStorage.clear();
    } catch (err) {
      console.warn('[LocalStorageProvider] Failed to clear storage', err);
    }
  }
}
