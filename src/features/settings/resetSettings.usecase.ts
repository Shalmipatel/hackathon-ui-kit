import type { ExtensionSettings } from '@/types';
import type { ISettingsRepository } from '@/types';

export class ResetSettingsUseCase {
  constructor(private repository: ISettingsRepository) {}

  async execute(): Promise<ExtensionSettings> {
    return await this.repository.resetSettings();
  }
}
