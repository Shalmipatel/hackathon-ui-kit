import { useState, useEffect, useCallback } from 'react';
import type { ExtensionSettings } from '@/types';
import { GetSettingsUseCase, UpdateSettingsUseCase, ResetSettingsUseCase } from '@/features/settings';
import { SettingsRepository } from '@/providers/settings';
import { LocalStorageProvider } from '@/providers/storage';

const DEFAULT_FALLBACK_TARGET_IP = '10.0.23.16';

const settingsStorage = new LocalStorageProvider();
const settingsRepo = new SettingsRepository(settingsStorage);
const getSettingsUseCase = new GetSettingsUseCase(settingsRepo, {
  fallbackTargetIp: DEFAULT_FALLBACK_TARGET_IP,
});
const updateSettingsUseCase = new UpdateSettingsUseCase(settingsRepo);
const resetSettingsUseCase = new ResetSettingsUseCase(settingsRepo);

export const useSettings = () => {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getSettingsUseCase.execute();
      setSettings(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const updateSettings = useCallback(async (updates: Partial<ExtensionSettings>) => {
    try {
      setError(null);
      const result = await updateSettingsUseCase.execute(updates);
      setSettings(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, []);

  const resetSettings = useCallback(async () => {
    try {
      setError(null);
      const result = await resetSettingsUseCase.execute();
      setSettings(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return { settings, loading, error, updateSettings, resetSettings, reload: loadSettings };
};
