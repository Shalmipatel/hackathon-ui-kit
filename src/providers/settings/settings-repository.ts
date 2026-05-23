import type { ExtensionSettings, IStorageProvider, ISettingsRepository } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';

const SETTINGS_KEY = 'settings';

export class SettingsRepository implements ISettingsRepository {
  constructor(private storage: IStorageProvider) {}

  async getSettings(): Promise<ExtensionSettings> {
    return await this.storage.get<ExtensionSettings>(SETTINGS_KEY, DEFAULT_SETTINGS);
  }

  async updateSettings(updates: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
    const current = await this.getSettings();
    const updated: ExtensionSettings = {
      ...current,
      ...updates,
      updatedAt: Date.now(),
    };
    await this.storage.set(SETTINGS_KEY, updated);
    return updated;
  }

  async resetSettings(): Promise<ExtensionSettings> {
    const defaults: ExtensionSettings = {
      ...DEFAULT_SETTINGS,
      updatedAt: Date.now(),
    };
    await this.storage.set(SETTINGS_KEY, defaults);
    return defaults;
  }
}
