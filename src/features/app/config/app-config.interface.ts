/**
 * Application configuration interface.
 * Combines hardcoded defaults with runtime overrides from ExtensionSettings.
 */
export interface AppConfig {
  api: ApiConfig;
  features: FeatureConfig;
  env: EnvConfig;
}

export interface ExternalServiceConfig {
  baseUrl: string;
}

export interface SessionConfig {
  meEndpoint: string;
  loginEndpoint: string;
  logoutEndpoint: string;
}

export interface IdentityConfig extends ExternalServiceConfig {
  callbackBaseUrl: string;
  allowedAppOrigins: string[];
  allowedCallbackOrigins: string[];
}

export interface IntegrationConfig {
  baseUrl: string;
}

export interface ApiConfig {
  gateway: GatewayConfig;
  session: SessionConfig;
  transcription: TranscriptionConfig;
  identity: IdentityConfig;
  integration: IntegrationConfig;
}

export interface GatewayConfig {
  chatEndpoint: string;
  agentId: string;
  model: string;
  userId: string;
  agentApiEnabled: boolean;
  agentApiEndpoint: string;
  agentAbortEndpoint: string;
}

export interface TranscriptionConfig {
  url: string;
}

export interface FeatureConfig {
  fallbackTargetIpEnabled: boolean;
  fallbackTargetIp: string;
  debugMode: boolean;
  showCronNotifications: boolean;
}

export interface EnvConfig {
  readonly isDev: boolean;
  readonly mode: string;
}
