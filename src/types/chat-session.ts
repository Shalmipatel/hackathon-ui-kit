import type { ChatMessage } from './chat-message';

/** Task status for Kanban board categorisation */
export type TaskStatus = 'todo' | 'in_progress' | 'needs_input' | 'completed';

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  /** True for the permanent #general session */
  isGeneral?: boolean;
  /** True if user pinned this session */
  isPinned?: boolean;
  /** Sort order within pinned sessions (lower = higher in list) */
  pinnedOrder?: number;
  /** Task status for Kanban board */
  status?: TaskStatus;
  /** True if this is a recurring / cron task */
  isRecurring?: boolean;
}

/** Lightweight summary for listing sessions without loading all messages */
export interface ChatSessionSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** True for the permanent #general session */
  isGeneral?: boolean;
  /** True if user pinned this session */
  isPinned?: boolean;
  /** Sort order within pinned sessions (lower = higher in list) */
  pinnedOrder?: number;
  /** Task status for Kanban board */
  status?: TaskStatus;
  /** True if this is a recurring / cron task */
  isRecurring?: boolean;
  /** True when backend updatedAt > local updatedAt; local cache is stale */
  needsRefresh?: boolean;
  /** True once this session has been seen in the backend sessions_list */
  isSynced?: boolean;
  /** True once an AI-generated title has been persisted for this session */
  isAiTitled?: boolean;
  /** Number of unread messages (e.g. from cron job results) */
  unreadCount?: number;
}

/** Well-known ID for the #general session */
export const GENERAL_SESSION_ID = 'general';

/** Content of the auto-sent seed message for the #general session */
export const GENERAL_START_CONTENT = 'Greet me and be my personal assistant';

