import type { IAuthRepository, IStorageProvider, ExtensionSettings } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';
import { resolveConfig } from '@/features/app/config';
import type { AppConfig } from '@/features/app/config';
import { TransportError, AuthExpiredError } from './transport.types';
import type { RequestOptions, PreparedRequest } from './transport.types';
import { withTimeout } from './timeout-signal.util';
import { buildBearerHeaders, serializeBody } from './transport.util';

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Centralized HTTP transport for all gateway calls.
 *
 * Enforces by default (no per-call boilerplate):
 *   - credentials: 'include' (always)
 *   - Authorization: Bearer <token> (only when includeBearerHeader is true and token
 *     non-empty; default false — cookie + edge cookie→Bearer; opt in e.g. Neo/token auth)
 *   - x-openclaw-agent-id: from config (always)
 *   - X-FALLBACK-TARGET-IP: when enabled in config
 *   - Content-Type: auto-detected from body type
 *   - Timeout: 10s default, overridable per call
 *   - 401 → AuthExpiredError
 *   - Non-ok → TransportError
 */
export class GatewayTransport {
  constructor(
    private authProvider: IAuthRepository,
    private settingsProvider: IStorageProvider,
    /**
     * When true, attaches Bearer from getAccessToken() (Neo/token auth).
     * Default false: no token fetch; auth via credentials: 'include' and proxy cookie→Bearer.
     */
    private readonly includeBearerHeader = false,
  ) {}

  /**
   * Full request lifecycle: resolve config, build headers, enforce timeout + 401 handling.
   * Use for simple request-response calls (non-streaming, session sync, cron, files).
   */
  async request(path: string, options?: RequestOptions): Promise<Response> {
    const { config, token } = await this.resolveAuthAndConfig();

    const headers = this.buildHeaders(config, token, options);
    const body = serializeBody(options?.body, headers);

    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const { signal, cleanup } = withTimeout(timeoutMs, options?.signal);

    try {
      const resp = await fetch(path, {
        method: options?.method ?? 'GET',
        headers,
        body,
        credentials: 'include',
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

  /**
   * Low-level: returns { url, init } with auth, agent-id, fallback-ip,
   * credentials already set. For callers that need custom fetch lifecycle
   * (fetchWithRetry, raw streaming, SSE).
   *
   * No timeout management — caller owns the signal/abort lifecycle.
   */
  async prepareRequest(
    path: string,
    options?: Omit<RequestOptions, 'timeoutMs'>,
  ): Promise<PreparedRequest> {
    const { config, token } = await this.resolveAuthAndConfig();

    const headers = this.buildHeaders(config, token, options);
    const body = serializeBody(options?.body, headers);

    return {
      url: path,
      init: {
        method: options?.method ?? 'GET',
        headers,
        body,
        credentials: 'include',
        signal: options?.signal,
      },
    };
  }

  private async resolveAuthAndConfig(): Promise<{ config: AppConfig; token: string }> {
    const token = this.includeBearerHeader
      ? await this.authProvider.getAccessToken()
      : '';
    const settings = await this.settingsProvider.get<ExtensionSettings>('settings', DEFAULT_SETTINGS);
    const config = resolveConfig(settings);
    return { config, token };
  }

  private buildHeaders(
    config: AppConfig,
    token: string,
    options?: Pick<RequestOptions, 'headers' | 'body'>,
  ): Record<string, string> {
    const headers = buildBearerHeaders(token, options);

    headers['x-openclaw-agent-id'] = config.api.gateway.agentId;

    if (config.features.fallbackTargetIpEnabled && config.features.fallbackTargetIp) {
      headers['X-FALLBACK-TARGET-IP'] = config.features.fallbackTargetIp;
    }

    return headers;
  }
}
