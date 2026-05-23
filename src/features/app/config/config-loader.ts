import type { AppConfig } from './app-config.interface';
import type { ExtensionSettings } from '@/types';
import { DEFAULT_CONFIG } from './defaults';

/**
 * Resolve final config by merging runtime settings with defaults.
 * Single source of truth for configuration resolution.
 */
export function resolveConfig(settings?: Partial<ExtensionSettings> | null): AppConfig {
  if (!settings) return DEFAULT_CONFIG;

  return {
    ...DEFAULT_CONFIG,
    api: {
      gateway: {
        ...DEFAULT_CONFIG.api.gateway,
        agentApiEnabled: settings.agentApiEnabled ?? DEFAULT_CONFIG.api.gateway.agentApiEnabled,
      },
      session: DEFAULT_CONFIG.api.session,
      transcription: {
        ...DEFAULT_CONFIG.api.transcription,
        ...(settings.transcriptionUrl && { url: settings.transcriptionUrl }),
      },
      identity: DEFAULT_CONFIG.api.identity,
      integration: DEFAULT_CONFIG.api.integration,
    },
    features: {
      fallbackTargetIpEnabled:
        settings.fallbackTargetIpEnabled ?? DEFAULT_CONFIG.features.fallbackTargetIpEnabled,
      fallbackTargetIp: settings.fallbackTargetIp ?? DEFAULT_CONFIG.features.fallbackTargetIp,
      debugMode: settings.debugMode ?? DEFAULT_CONFIG.features.debugMode,
      showCronNotifications: DEFAULT_CONFIG.features.showCronNotifications,
    },
    env: DEFAULT_CONFIG.env,
  };
}

/** Get default config without runtime overrides */
export function getDefaultConfig(): AppConfig {
  return DEFAULT_CONFIG;
}
