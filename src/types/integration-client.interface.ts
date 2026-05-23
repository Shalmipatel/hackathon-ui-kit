import type { IntegrationService, GoogleAccessToken } from './integration';

export interface IntegrationCredentialStatus {
  provider: string;
  connected: boolean;
  emails: string[];
  updatedAt: string;
}

export interface IIntegrationClient {
  listServices(provider: string, signal?: AbortSignal): Promise<IntegrationService[]>;
  listCredentials(signal?: AbortSignal): Promise<IntegrationCredentialStatus[]>;
  getConnectPath(provider: string): string;
  disconnect(provider: string, accountId: string, signal?: AbortSignal): Promise<void>;
  deleteCredentials(provider: string, signal?: AbortSignal): Promise<void>;
  upsertCredentials(
    provider: string,
    secrets: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<void>;
  getTokens(providers: string[], signal?: AbortSignal): Promise<GoogleAccessToken[]>;
  invalidateTokenCache(): void;
}
