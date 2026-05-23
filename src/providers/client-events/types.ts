/**
 * Client-events — typed envelope shapes for events the web app emits to the
 * platform-service via POST /api/neoclaw-platform/client-events.
 *
 * IMPORTANT: keep this in lockstep with the server-side definitions at
 *   neoclaw-addons/neoclaw-platform-service/service/src/modules/client-events/types.ts
 *
 * If you add a new event:
 *   1. Add the data interface and ClientEventEnvelope alias here.
 *   2. Add it to the ClientEvent union and ClientEventType union.
 *   3. Mirror the same change on the server.
 *   4. Add a registry entry on the server.
 */

export type ClientEventType = 'chat.response.received';

export interface ClientEventEnvelope<TType extends ClientEventType, TData> {
  readonly type: TType;
  /** Epoch milliseconds. Server validates against a sanity window. */
  readonly occurredAt: number;
  /** Optional per-tab/per-WebView identifier (UUIDv4). Capped at 64 chars. */
  readonly clientId?: string;
  readonly data: TData;
}

export interface ChatResponseReceivedData {
  readonly runId: string;
  readonly sessionKey: string;
}

export type ChatResponseReceivedEvent = ClientEventEnvelope<
  'chat.response.received',
  ChatResponseReceivedData
>;

export type ClientEvent = ChatResponseReceivedEvent;
