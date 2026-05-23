import type { ExtensionSettings } from '@/types';
import type { ISettingsRepository } from '@/types';

export class UpdateSettingsUseCase {
  constructor(private repository: ISettingsRepository) {}

  async execute(updates: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
    const current = await this.repository.getSettings();

    const merged: Partial<ExtensionSettings> = {
      ...updates,
      updatedAt: Date.now(),
      version: current.version,
    };

    return await this.repository.updateSettings(merged);
  }
}
