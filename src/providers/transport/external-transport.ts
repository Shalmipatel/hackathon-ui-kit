/**
 * HTTP transport for external (non-gateway) APIs.
 *
 * Separate from GatewayTransport because:
 *   - Different server (social / integration, not gateway)
 *   - No gateway-specific headers (no x-openclaw-agent-id, no X-FALLBACK-TARGET-IP)
 *   - Base URL injected at construction (no IStorageProvider / resolveConfig)
 *   - Integration: prefer Bearer from getAccessToken(); if empty, same-origin cookies
 *     (OAuth session). Social: cookies only (includeBearerHeader false).
 *   - Same error classes (AuthExpiredError, TransportError) for uniform handling
 *   - 15s default timeout (external services may be slower than gateway)
 */

import type { IAuthRepository } from '@/types';
import type { RequestOptions } from './transport.types';
import { TransportError, AuthExpiredError } from './transport.types';
import { withTimeout } from './timeout-signal.util';
import { buildBearerHeaders, serializeBody } from './transport.util';

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Endpoint paths for external services (relative to each service's base URL).
 * Co-located with ExternalTransport to keep external concerns separate
 * from GATEWAY_ENDPOINTS which is reserved for gateway-routed APIs.
 */
export const EXTERNAL_ENDPOINTS = {
  SOCIAL: {
    ACCOUNTS: '/api/public/social/v1/accounts',
    CONNECT: '/api/public/social/v1/connect',
  },
  INTEGRATION: {
    STATUS: '/api/integration/status',
    CONNECT_PREFIX: '/api/integration',
    DISCONNECT: '/api/integration/disconnect',
    TOKEN: '/api/integration/token',
    CREDENTIALS: '/api/public/integration/credentials',
  },
  USERS: {
    REGISTER: '/api/public/users/register',
    WAITLIST: '/api/public/users/waitlist',
  },
  FEEDBACK: '/api/public/feedback',
} as const;

export class ExternalTransport {
  constructor(
    private baseUrl: string,
    private authProvider: IAuthRepository,
    /** When true, send Bearer when getAccessToken() returns a token; else fall back to cookies. */
    private readonly includeBearerHeader = false,
  ) {}

  async request(path: string, options?: RequestOptions): Promise<Response> {
    const token = this.includeBearerHeader
      ? await this.authProvider.getAccessToken()
      : '';
    const headers = buildBearerHeaders(token, options);
    const body = serializeBody(options?.body, headers);

    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const { signal, cleanup } = withTimeout(timeoutMs, options?.signal);

    const hasBearer = Boolean(token?.trim());
    const useCredentials = !this.includeBearerHeader || !hasBearer;

    try {
      const fetchUrl = `${this.baseUrl}${path}`;
      const resp = await fetch(fetchUrl, {
        method: options?.method ?? 'GET',
        headers,
        body,
        ...(useCredentials && { credentials: 'include' as RequestCredentials }),
        signal,
      });

      if (resp.status === 401) throw new AuthExpiredError();
      if (!resp.ok) {
        const errorBody = await resp.text().catch(() => '');
        throw new TransportError(resp.status, errorBody);
      }
      return resp;
    } finally {
      cleanup();
    }
  }
}
