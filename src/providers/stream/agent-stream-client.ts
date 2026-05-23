/**
 * Agent Stream Client - Agent API streaming client using GatewayTransport.
 * Implements IStreamClient for the Agent API path (WS events tunneled as SSE).
 *
 * Uses AgentSSEParser to handle OpenClaw WS events and emits 'event' type
 * StreamEvents for tool events and other WS events alongside text chunks.
 */

import type { IStreamClient, StreamEvent, StreamRequest } from '@/types';
import { toSessionKeyHeader } from '@/providers/sync/session-key.util';
import { createAgentSSEParser, type AgentSSEParser } from './agent-sse-parser';
import { buildInput } from '@/providers/chat/request-builder.util';
import { mapStreamError, ERROR_MESSAGES } from '@/providers/chat/error-mapper.util';
import { fetchStreamWithRetry } from '@/providers/transport/fetch-with-retry.util';
import type { GatewayTransport } from '@/providers/transport/gateway-transport';
import type { ClientEventsClient } from '@/providers/client-events';

const STREAM_IDLE_TIMEOUT_MS = 300_000;
const STREAM_RETRY_MAX_ATTEMPTS = 3;
const STREAM_RETRY_INTERVAL_MS = 3_000;
const STREAM_REQUEST_TIMEOUT_MS = 30_000;

export class AgentStreamClient implements IStreamClient {
  private activeStreams = new Map<string, AbortController>();
  private idleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private parsers = new Map<string, AgentSSEParser>();
  private doneEmitted = new Set<string>();
  private eventHandlers = new Set<(event: StreamEvent) => void>();

  constructor(
    private gateway: GatewayTransport,
    private clientEvents: ClientEventsClient,
  ) {}

  async startStream(sessionId: string, request: StreamRequest): Promise<void> {
    this.abortStream(sessionId);
    this.doneEmitted.delete(sessionId);

    const sessionKeyHeaderValue = toSessionKeyHeader(sessionId);

    let lastRunId: string | null = null;

    const parser = createAgentSSEParser({
      onDelta: (text) => {
        this.emit({ type: 'chunk', sessionId, content: text });
      },
      onDone: () => {
        if (this.doneEmitted.has(sessionId)) return;
        this.doneEmitted.add(sessionId);
        this.parsers.delete(sessionId);

        // Ack the platform-service on [DONE] so it cancels the pending push
        // dispatch. [DONE] is the last SSE frame regardless of which terminal
        // event triggered it (lifecycle:end, chat:final, etc.). Server's 15s
        // timeout is the safety net if this POST fails.
        if (lastRunId) {
          this.clientEvents.emit({
            type: 'chat.response.received',
            occurredAt: Date.now(),
            data: { runId: lastRunId, sessionKey: sessionKeyHeaderValue },
          });
        }

        this.emit({ type: 'done', sessionId });
      },
      onError: (error) => {
        this.doneEmitted.delete(sessionId);
        this.parsers.delete(sessionId);
        this.emit({ type: 'error', sessionId, error: mapStreamError(error) });
      },
      onEvent: (eventType, data) => {
        if (typeof data.runId === 'string') {
          lastRunId = data.runId;
        }

        this.emit({
          type: 'event',
          sessionId,
          event: eventType,
          payload: data,
        });
      },
    });
    this.parsers.set(sessionId, parser);

    const input = buildInput({
      messages: request.messages,
      audioDataUrl: request.audioDataUrl,
      attachments: request.attachments,
    });

    const body = JSON.stringify({
      sessionKey: sessionKeyHeaderValue,
      message: input,
      model: 'openclaw',
      agentId: 'main',
      userId: 'neoclaw',
    });

    let prepared;
    try {
      prepared = await this.gateway.prepareRequest('/api/neoclaw-agent/chat', {
        method: 'POST',
        headers: {
          'x-openclaw-session-key': sessionKeyHeaderValue,
        },
        body,
      });
    } catch (err) {
      this.parsers.delete(sessionId);
      const errorMsg = err instanceof Error ? err.message : ERROR_MESSAGES.TOKEN_FAILED;
      this.emit({ type: 'error', sessionId, error: errorMsg });
      return;
    }

    const controller = new AbortController();
    this.activeStreams.set(sessionId, controller);

    const result = await fetchStreamWithRetry(
      prepared.url,
      { ...prepared.init, signal: controller.signal },
      {
        maxAttempts: STREAM_RETRY_MAX_ATTEMPTS,
        intervalMs: STREAM_RETRY_INTERVAL_MS,
        requestTimeoutMs: STREAM_REQUEST_TIMEOUT_MS,
        isRetryable: (s) => s >= 500 || s === 0,
        abortSignal: controller.signal,
        onAttempt: (attempt) => {
          if (attempt > 1) {
            this.emit({
              type: 'retrying',
              sessionId,
              attempt,
              maxAttempts: STREAM_RETRY_MAX_ATTEMPTS,
            });
          }
        },
      },
    );

    if (!result.ok) {
      this.cleanup(sessionId);
      if (result.reason === 'aborted') {
        this.emit({ type: 'aborted', sessionId });
      } else {
        const error =
          result.status >= 500
            ? ERROR_MESSAGES.UNAVAILABLE
            : mapStreamError(result.body || `Request failed with status ${result.status}`);
        this.emit({ type: 'error', sessionId, error });
      }
      return;
    }

    if (!result.response?.body) {
      this.cleanup(sessionId);
      this.emit({ type: 'error', sessionId, error: 'Response body is empty' });
      return;
    }

    this.resetIdleTimer(sessionId, controller);

    const reader = result.response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        this.resetIdleTimer(sessionId, controller);
        const chunk = decoder.decode(value, { stream: true });
        parser.feed(chunk);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        this.emit({ type: 'aborted', sessionId });
      } else {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        this.emit({ type: 'error', sessionId, error: mapStreamError(errMsg) });
      }
    } finally {
      reader.releaseLock();
      this.cleanup(sessionId);
    }
  }

  abortStream(sessionId: string): void {
    const controller = this.activeStreams.get(sessionId);
    if (controller) {
      controller.abort();
      this.cleanup(sessionId);

      this.sendAbortRequest(sessionId).catch((err) => {
        console.warn('[AgentStreamClient] Server-side abort failed:', err);
      });
    }
    this.parsers.delete(sessionId);
    this.doneEmitted.delete(sessionId);
  }

  onEvent(handler: (event: StreamEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  abortAll(): void {
    for (const [, controller] of this.activeStreams) {
      controller.abort();
    }
    this.activeStreams.clear();
    for (const timer of this.idleTimers.values()) {
      clearTimeout(timer);
    }
    this.idleTimers.clear();
    this.parsers.clear();
    this.doneEmitted.clear();
  }

  hasActiveStreams(): boolean {
    return this.activeStreams.size > 0;
  }

  getActiveSessionIds(): string[] {
    return Array.from(this.activeStreams.keys());
  }

  destroy(): void {
    this.abortAll();
    this.eventHandlers.clear();
  }

  private async sendAbortRequest(sessionId: string): Promise<void> {
    const sessionKeyHeaderValue = toSessionKeyHeader(sessionId);

    try {
      await this.gateway.request('/api/neoclaw-agent/abort', {
        method: 'POST',
        body: JSON.stringify({ sessionKey: sessionKeyHeaderValue }),
        timeoutMs: 5_000,
      });
    } catch {
      // Fire-and-forget — abort failures are non-critical
    }
  }

  private resetIdleTimer(sessionId: string, controller: AbortController): void {
    this.clearIdleTimer(sessionId);
    this.idleTimers.set(
      sessionId,
      setTimeout(() => {
        console.warn('[AgentStreamClient] Stream idle timeout - no response from agent');
        this.emit({ type: 'error', sessionId, error: ERROR_MESSAGES.TIMEOUT_ERROR });
        controller.abort();
      }, STREAM_IDLE_TIMEOUT_MS),
    );
  }

  private clearIdleTimer(sessionId: string): void {
    const timer = this.idleTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.idleTimers.delete(sessionId);
    }
  }

  private cleanup(sessionId: string): void {
    this.activeStreams.delete(sessionId);
    this.clearIdleTimer(sessionId);
  }

  private emit(event: StreamEvent): void {
    for (const handler of this.eventHandlers) {
      handler(event);
    }
  }
}
