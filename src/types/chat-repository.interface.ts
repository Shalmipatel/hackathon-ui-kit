import type { ChatMessage } from './chat-message';
import type { ChatSession, ChatSessionSummary, TaskStatus } from './chat-session';

export interface IChatRepository {
  /** Get all session summaries (without messages), newest first */
  getSessions(): Promise<ChatSessionSummary[]>;

  /** Get a full session by ID, or null if not found */
  getSession(id: string): Promise<ChatSession | null>;

  /** Get or create the permanent #general session */
  getOrCreateGeneralSession(): Promise<ChatSession>;

  /** Clear #general messages without deleting the session */
  clearGeneralSession(): Promise<ChatSession>;

  /** Create a new task session and return it. If `id` is provided and a session with that ID already exists, the existing session is returned (idempotent). */
  createSession(id?: string): Promise<ChatSession>;

  /** Append a message to a session and persist */
  addMessage(sessionId: string, message: ChatMessage): Promise<void>;

  /** Update the session title */
  updateTitle(sessionId: string, title: string): Promise<void>;

  /** Replace all messages in a session */
  updateMessages(sessionId: string, messages: ChatMessage[]): Promise<void>;

  /** Pin a session */
  pinSession(id: string): Promise<void>;

  /** Unpin a session */
  unpinSession(id: string): Promise<void>;

  /** Reorder pinned sessions by their IDs (first = top) */
  reorderPinnedSessions(orderedIds: string[]): Promise<void>;

  /** Delete a session by ID (cannot delete #general) */
  deleteSession(id: string): Promise<void>;

  /** Get the most recent session, or create one if none exist */
  getOrCreateCurrentSession(): Promise<ChatSession>;

  /** Update the task status of a session */
  updateStatus(id: string, status: TaskStatus): Promise<void>;

  /** Persist a full session object (create or overwrite). Used for backend-restored sessions. */
  saveSession(session: ChatSession): Promise<void>;

  /** Replace the entire session index. Used by the sync reconciliation flow. */
  saveSessions(index: ChatSessionSummary[]): Promise<void>;
}
