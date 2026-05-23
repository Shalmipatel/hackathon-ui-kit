/**
 * Integration client — Identity Server integration API (multi-account).
 *
 * All provider-specific methods accept a `provider` string (e.g. "Gmail",
 * "Gcal") so the same client serves multiple integration cards.
 *
 * Two transports split the traffic:
 *  - `proxyTransport` (same-origin) handles credential data endpoints.
 *  - `directTransport` (cross-origin to identity server) handles data
 *    endpoints (status, token, disconnect) without going through the
 *    gateway proxy.
 */

import type {
  IIntegrationClient,
  GoogleAccessToken,
  IntegrationCredentialStatus,
  IntegrationService,
  ConnectedAccount,
} from '@/types';
import type { ExternalTransport } from '@/providers/transport/external-transport';
import { EXTERNAL_ENDPOINTS } from '@/providers/transport/external-transport';

const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
];

const INTEGRATION_SOURCE = 'OpenClaw';

interface LinkedAccount {
  id: string;
  provider: string;
  isConnected: boolean;
  expiration?: number;
  displayName: string;
}

const TOKEN_CACHE_TTL = 50 * 60 * 1000;

export class IntegrationClient implements IIntegrationClient {
  private tokenCache: { tokens: GoogleAccessToken[]; fetchedAt: number } | null = null;

  constructor(
    private proxyTransport: ExternalTransport,
    private directTransport: ExternalTransport,
    /** Base URL for the gateway hosting the integration-relay page. */
    private gatewayBaseUrl: string,
  ) {}

  private async fetchLinkedAccounts(signal?: AbortSignal): Promise<LinkedAccount[]> {
    const resp = await this.directTransport.request(
      EXTERNAL_ENDPOINTS.INTEGRATION.STATUS,
      {
        method: 'POST',
        body: { source: INTEGRATION_SOURCE },
        signal,
      },
    );
    const data = await resp.json();
    return (data.apps ?? []) as LinkedAccount[];
  }

  async listServices(provider: string, signal?: AbortSignal): Promise<IntegrationService[]> {
    const all = await this.fetchLinkedAccounts(signal);
    const linked = all.filter((a) => a.provider === provider);

    const accounts: ConnectedAccount[] = linked.map((a) => ({
      accountId: a.id,
      email: a.displayName || a.id,
      isConnected: a.isConnected,
    }));

    return [{ key: provider, name: provider, description: '', accounts }];
  }

  async listCredentials(signal?: AbortSignal): Promise<IntegrationCredentialStatus[]> {
    const resp = await this.proxyTransport.request(
      EXTERNAL_ENDPOINTS.INTEGRATION.CREDENTIALS,
      { signal },
    );
    const data = await resp.json();
    return (data.credentials ?? []) as IntegrationCredentialStatus[];
  }

  /**
   * Returns the absolute URL of the integration-relay page.
   * The relay receives a JWT via postMessage, sets a short-lived auth cookie,
   * then navigates to the integration connect endpoint on the same origin.
   */
  getConnectPath(provider: string): string {
    return `${this.gatewayBaseUrl}/integration-relay?provider=${encodeURIComponent(provider)}`;
  }

  /**
   * Disconnects a specific linked account.
   * Uses directTransport (cross-origin to identity server).
   */
  async disconnect(provider: string, accountId: string, signal?: AbortSignal): Promise<void> {
    await this.directTransport.request(
      EXTERNAL_ENDPOINTS.INTEGRATION.DISCONNECT,
      {
        method: 'POST',
        body: {
          provider,
          source: INTEGRATION_SOURCE,
          accountId,
        },
        signal,
      },
    );
    this.invalidateTokenCache();
  }

  async deleteCredentials(provider: string, signal?: AbortSignal): Promise<void> {
    await this.proxyTransport.request(
      `${EXTERNAL_ENDPOINTS.INTEGRATION.CREDENTIALS}/${provider}`,
      { method: 'DELETE', signal },
    );
  }

  async upsertCredentials(
    provider: string,
    secrets: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.proxyTransport.request(
      `${EXTERNAL_ENDPOINTS.INTEGRATION.CREDENTIALS}/${provider}`,
      {
        method: 'PUT',
        body: { secrets },
        signal,
      },
    );
  }

  /**
   * Retrieves Google access tokens across multiple providers.
   * Uses a 50-minute local cache to avoid redundant /status + /token calls
   * during the poll cycle. Makes a single /status call and filters client-side
   * instead of calling listServices() per provider.
   */
  async getTokens(providers: string[], signal?: AbortSignal): Promise<GoogleAccessToken[]> {
    if (this.tokenCache && Date.now() - this.tokenCache.fetchedAt < TOKEN_CACHE_TTL) {
      const cached = this.tokenCache.tokens.filter((t) => providers.includes(t.provider));
      if (cached.length > 0) {
        return cached;
      }
    }

    try {
      const allApps = await this.fetchLinkedAccounts(signal);
      const linked = allApps.filter((a) => a.isConnected);

      if (linked.length === 0) {
        this.tokenCache = { tokens: [], fetchedAt: Date.now() };
        return [];
      }

      const seen = new Set<string>();
      const unique = linked.filter((a) => {
        const key = `${a.provider}:${a.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const tokens: GoogleAccessToken[] = [];

      for (const account of unique) {
        try {
          const tokenResp = await this.directTransport.request(
            EXTERNAL_ENDPOINTS.INTEGRATION.TOKEN,
            {
              method: 'POST',
              body: {
                serviceProvider: account.provider,
                source: INTEGRATION_SOURCE,
                accountId: account.id,
              },
              signal,
            },
          );
          const accessToken = await tokenResp.text();
          if (accessToken) {
            tokens.push({
              accountId: account.id,
              email: account.displayName || account.id,
              accessToken,
              accessTokenExpiresAt: '',
              scopes: GOOGLE_SCOPES,
              provider: account.provider,
            });
          }
        } catch {
          // Skip accounts whose tokens can't be retrieved
        }
      }

      this.tokenCache = { tokens, fetchedAt: Date.now() };
      return tokens.filter((t) => providers.includes(t.provider));
    } catch {
      return [];
    }
  }

  invalidateTokenCache(): void {
    this.tokenCache = null;
  }
}
