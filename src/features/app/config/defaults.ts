import type { AppConfig } from './app-config.interface';

const neoclawApiUrl = import.meta.env.VITE_NEOCLAW_API_URL ?? '';
const identityBaseUrl = import.meta.env.VITE_IDENTITY_BASE_URL ?? neoclawApiUrl;
const integrationBaseUrl = import.meta.env.VITE_INTEGRATION_BASE_URL ?? identityBaseUrl;
const authCallbackBaseUrl = import.meta.env.VITE_AUTH_CALLBACK_BASE_URL ?? identityBaseUrl;

/**
 * Default configuration.
 * Gateway and social are same-origin (relative paths only). Optional
 * service URLs default to the main gateway URL, so most setups only
 * need VITE_NEOCLAW_API_URL plus an access token.
 */
export const DEFAULT_CONFIG: AppConfig = {
  api: {
    gateway: {
      chatEndpoint: '/v1/responses',
      agentId: 'main',
      model: 'openclaw',
      userId: 'neoclaw',
      agentApiEnabled: true,
      agentApiEndpoint: '/api/neoclaw-agent/chat',
      agentAbortEndpoint: '/api/neoclaw-agent/abort',
    },
    session: {
      meEndpoint: '/api/session/me',
      loginEndpoint: '/api/session/login',
      logoutEndpoint: '/api/session/logout',
    },
    transcription: {
      url: import.meta.env.VITE_TRANSCRIPTION_URL ?? '',
    },
    identity: {
      baseUrl: identityBaseUrl,
      callbackBaseUrl: authCallbackBaseUrl,
      allowedAppOrigins: (import.meta.env.VITE_ALLOWED_APP_ORIGINS ?? '')
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean),
      allowedCallbackOrigins: (import.meta.env.VITE_ALLOWED_CALLBACK_ORIGINS ?? '')
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean),
    },
    integration: {
      baseUrl: integrationBaseUrl,
    },
  },
  features: {
    fallbackTargetIpEnabled: false,
    fallbackTargetIp: '',
    debugMode: false,
    showCronNotifications: false,
  },
  env: {
    isDev: import.meta.env.MODE === 'development',
    mode: import.meta.env.MODE ?? 'production',
  },
};
