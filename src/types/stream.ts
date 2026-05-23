/**
 * Stream state for a single chat session.
 * Tracks the current streaming status and accumulated content.
 */
export interface StreamState {
  /** Current streaming status */
  status: 'idle' | 'streaming' | 'error' | 'aborted' | 'loading';
  /** ID of the assistant message being streamed (for React reconciliation) */
  messageId: string | null;
  /** Accumulated streaming content */
  content: string;
  /** Error message if status is 'error' */
  error: string | null;
  /** Timestamp when streaming started (for timeout tracking) */
  startedAt: number | null;
}

/** Initial stream state for new sessions */
export const INITIAL_STREAM_STATE: StreamState = {
  status: 'idle',
  messageId: null,
  content: '',
  error: null,
  startedAt: null,
};
