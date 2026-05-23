/**
 * Non-streaming client for synchronous LLM requests.
 *
 * Matches the extension's LLM_REQUEST handler behaviour:
 *  - Single-attempt fetch (no retry)
 *  - Configurable timeout via GatewayTransport (default 10s)
 *  - AbortError distinction for "Request timed out"
 *  - Non-ok response text truncation (200 chars)
 *  - JSON response parsing with dual format support (OpenAI + legacy)
 *
 * Uses GatewayTransport for auth, headers, credentials, and 401 handling.
 */

import type { INonStreamingClient, NonStreamingRequest } from '@/types';
import { NON_STREAMING_TIMEOUT_MS } from '@/types';
import type { GatewayTransport } from '@/providers/transport/gateway-transport';
import { GATEWAY_ENDPOINTS } from '@/providers/transport/gateway-endpoints';

interface LLMResponseData {
  output?: Array<{
    content?: Array<{
      text?: string;
    }>;
  }>;
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export class NonStreamingClient implements INonStreamingClient {
  constructor(private gateway: GatewayTransport) {}

  async request(payload: NonStreamingRequest): Promise<string> {
    const headers: Record<string, string> = {};

    if (payload.sessionKey) {
      headers['x-openclaw-session-key'] = payload.sessionKey;
    }

    const timeoutMs = payload.timeout ?? NON_STREAMING_TIMEOUT_MS;

    try {
      const resp = await this.gateway.request(GATEWAY_ENDPOINTS.CHAT, {
        method: 'POST',
        headers,
        body: {
          model: 'openclaw',
          stream: false,
          user: 'neoclaw',
          input: payload.messages.map((m) => ({
            type: 'message',
            role: m.role,
            content: m.content,
          })),
        },
        timeoutMs,
      });

      const data = (await resp.json()) as LLMResponseData;
      return this.parseResponse(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('Request timed out');
      }
      throw err;
    }
  }

  private parseResponse(data: LLMResponseData): string {
    return (
      data?.output?.[0]?.content?.[0]?.text?.trim() ??
      data?.choices?.[0]?.message?.content?.trim() ??
      ''
    );
  }
}
