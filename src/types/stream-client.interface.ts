import type { FileAttachment } from './chat-message';

/**
 * Event emitted by the stream client during a streaming operation.
 * All events include the sessionId for routing to the correct session.
 */
export interface StreamEvent {
  /** Event type */
  type: 'chunk' | 'done' | 'error' | 'aborted' | 'retrying' | 'event';
  /** Session this event belongs to (for concurrent stream routing) */
  sessionId: string;
  /** Content delta for 'chunk' events */
  content?: string;
  /** Error message for 'error' events */
  error?: string;
  /** Current retry attempt for 'retrying' events */
  attempt?: number;
  /** Max retry attempts for 'retrying' events */
  maxAttempts?: number;
  /** Event name for 'event' type (e.g., 'agent', 'chat', 'sessions.changed') */
  event?: string;
  /** Event payload for 'event' type (pass-through from WS events) */
  payload?: Record<string, unknown>;
}

/**
 * Request payload for starting a stream.
 */
export interface StreamRequest {
  /** Chat history messages to send */
  messages: { role: string; content: string }[];
  /** Base64 data URL of an audio recording */
  audioDataUrl?: string;
  /** File/image attachments */
  attachments?: FileAttachment[];
}

/**
 * Stream client interface for managing streaming chat responses.
 * Supports concurrent streams across multiple sessions.
 */
export interface IStreamClient {
  /**
   * Start a streaming request for the given session.
   * If a stream is already active for this session, it will be aborted first.
   */
  startStream(sessionId: string, request: StreamRequest): Promise<void>;

  /**
   * Abort an active stream for the given session.
   * Partial content is preserved - finishStream will be called.
   */
  abortStream(sessionId: string): void;

  /**
   * Register a handler for stream events.
   * Returns an unsubscribe function.
   */
  onEvent(handler: (event: StreamEvent) => void): () => void;

  /**
   * IDs of sessions with currently-active streams (controllers in flight).
   * Authoritative truth for "is this session live"; preferred over local
   * stream.status flags which can be stale across BG/FG transitions.
   */
  getActiveSessionIds(): string[];

  /** True iff getActiveSessionIds().length > 0. */
  hasActiveStreams(): boolean;
}
