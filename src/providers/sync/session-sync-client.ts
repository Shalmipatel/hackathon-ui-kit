/**
 * Session sync client — talks to the gateway's tools/invoke endpoint.
 *
 * Replicates the full extension flow:
 *   SessionSyncClient.invoke() → bridge.call({ type: 'LLM_REQUEST' })
 *
 * Capabilities matched 1:1 with the extension:
 *  - Auth + config resolution via GatewayTransport
 *  - Single-attempt fetch to /tools/invoke (no retry)
 *  - Configurable timeout via AbortController (NON_STREAMING_TIMEOUT_MS = 10s)
 *  - AbortError distinction → "Request timed out"
 *  - Non-ok response text truncation to 200 chars
 *  - Response JSON parsing with ok/result.details extraction
 *  - credentials: 'include' for cookie-based auth
 */

import type {
  ISessionSyncClient,
  RemoteSessionSummary,
  RemoteSessionHistory,
} from '@/types';
import { NON_STREAMING_TIMEOUT_MS } from '@/types';
import type { GatewayTransport } from '@/providers/transport/gateway-transport';
import { GATEWAY_ENDPOINTS } from '@/providers/transport/gateway-endpoints';
import { toSessionKeyHeader } from './session-key.util';

interface ToolsInvokeResponse {
  ok?: boolean;
  result?: {
    details?: Record<string, unknown>;
  };
}

export class SessionSyncClient implements ISessionSyncClient {
  constructor(private gateway: GatewayTransport) {}

  async listSessions(limit = 50): Promise<RemoteSessionSummary[]> {
    const data = await this.invoke('sessions_list', { limit, kind: 'main', model: 'openclaw' });
    const sessions = (data?.sessions ?? []) as RemoteSessionSummary[];
    return sessions;
  }

  async getSessionHistory(sessionKey: string, limit = 50): Promise<RemoteSessionHistory> {
    const data = await this.invoke('sessions_history', {
      sessionKey: toSessionKeyHeader(sessionKey),
      limit,
      kind: 'main',
      model: 'openclaw',
    });

    return {
      sessionKey: (data?.sessionKey as string) ?? sessionKey,
      messages: (data?.messages as RemoteSessionHistory['messages']) ?? [],
      truncated: (data?.truncated as boolean) ?? false,
      contentTruncated: (data?.contentTruncated as boolean) ?? false,
    };
  }

  async deleteSession(sessionKey: string): Promise<void> {
    await this.invoke('sessions.delete', {
      key: toSessionKeyHeader(sessionKey),
      deleteTranscript: true,
    });
  }

  private async invoke(tool: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    try {
      const resp = await this.gateway.request(GATEWAY_ENDPOINTS.TOOLS_INVOKE, {
        method: 'POST',
        body: { tool, args },
        timeoutMs: NON_STREAMING_TIMEOUT_MS,
      });

      const responseData = (await resp.json()) as ToolsInvokeResponse;

      if (!responseData?.ok) {
        throw new Error(`tools/invoke (${tool}) returned ok=false`);
      }

      return (responseData.result?.details ?? {}) as Record<string, unknown>;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('Request timed out');
      }
      throw err;
    }
  }
}
