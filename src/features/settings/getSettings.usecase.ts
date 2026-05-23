import type { ExtensionSettings } from '@/types';
import type { ISettingsRepository } from '@/types';

export interface SettingsDefaults {
  fallbackTargetIp: string;
}

export class GetSettingsUseCase {
  constructor(
    private repository: ISettingsRepository,
    private defaults?: SettingsDefaults,
  ) {}

  async execute(): Promise<ExtensionSettings> {
    const settings = await this.repository.getSettings();

    if (!this.defaults) return settings;

    return {
      ...settings,
      fallbackTargetIp: settings.fallbackTargetIp || this.defaults.fallbackTargetIp,
    };
  }
}
