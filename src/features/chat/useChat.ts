/**
 * Primary chat hook that wraps the Zustand store.
 */

import { useEffect, useCallback, useMemo, useRef } from 'react';
import { getChatStore } from '@/features/app/bootstrap';
import {
  selectActiveMessages,
  selectSessionList,
  selectActiveIsStreaming,
  selectStreamingMessageId,
  selectIsGeneralSession,
  selectConnectionStatus,
  selectIsSessionLoading,
  selectIsSyncing,
  selectActiveTool,
  type ActiveTool,
} from '@/store/chat-store';
import type { ChatMessage, ChatSessionSummary, ConnectionStatus, FileAttachment, TaskStatus } from '@/types';
export type { ActiveTool } from '@/store/chat-store';
import { GENERAL_SESSION_ID } from '@/types';
import { EVENTS, track } from '@/features/analytics';

interface UseChatReturn {
  messages: ChatMessage[];
  sessions: ChatSessionSummary[];
  currentSessionId: string | null;
  isGeneralSession: boolean;
  isSessionLoading: boolean;
  /**
   * True while a backend reconcile is in flight (initial sync after login,
   * or a lifecycle resume reconcile). Consumers use this to disable the
   * chat input and prevent user-send from racing the active-session
   * content refresh inside `reconcileOnResume`.
   */
  isSyncing: boolean;
  status: ConnectionStatus;
  isStreaming: boolean;
  streamingMessageId: string | null;
  activeTool: ActiveTool | null;
  sendMessage: (text: string, audioDataUrl?: string, attachments?: FileAttachment[], isHidden?: boolean) => void;
  abortStream: () => void;
  regenerate: () => void;
  newTask: () => Promise<string>;
  clearGeneralSession: () => void;
  switchSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  pinSession: (sessionId: string) => void;
  unpinSession: (sessionId: string) => void;
  refreshSessions: () => void;
  markComplete: (sessionId: string) => void;
  updateTaskStatus: (sessionId: string, status: TaskStatus) => void;
}

export function useChat(isAuthenticated: boolean): UseChatReturn {
  const store = getChatStore();
  const prevAuthRef = useRef(isAuthenticated);

  const messages = store(selectActiveMessages);
  const sessions = store(selectSessionList);
  const currentSessionId = store((state) => state.activeSessionId);
  const isGeneralSession = store(selectIsGeneralSession);
  const isSessionLoading = store(selectIsSessionLoading);
  const status = store(selectConnectionStatus);
  const isStreaming = store(selectActiveIsStreaming);
  const streamingMessageId = store(selectStreamingMessageId);
  const activeTool = store(selectActiveTool);
  const isSyncing = store(selectIsSyncing);

  useEffect(() => {
    if (isAuthenticated && !prevAuthRef.current) {
      store.getState().syncWithBackend().catch((err) => {
        console.warn('[useChat] Post-login sync failed:', err);
      });
    }
    prevAuthRef.current = isAuthenticated;
  }, [isAuthenticated, store]);

  useEffect(() => {
    if (
      isAuthenticated &&
      currentSessionId === GENERAL_SESSION_ID &&
      messages.length === 0 &&
      !isStreaming &&
      !isSyncing
    ) {
      store.getState().initGeneralSession();
    }
  }, [isAuthenticated, currentSessionId, messages.length, isStreaming, isSyncing, store]);

  const sendMessage = useCallback(
    (text: string, audioDataUrl?: string, attachments?: FileAttachment[], isHidden?: boolean) => {
      const state = store.getState();
      const sessionId = state.activeSessionId;
      if (!sessionId) {
        console.warn('[useChat] No active session, cannot send message');
        return;
      }
      if (!isHidden) {
        track(EVENTS.CHAT_MESSAGE_SENT, {
          message_length: text.length,
          has_attachment: !!(attachments && attachments.length > 0),
        });
      }
      state.sendMessage(sessionId, text, audioDataUrl, attachments, isHidden);
    },
    [store],
  );

  const abortStream = useCallback(() => {
    const state = store.getState();
    const sessionId = state.activeSessionId;
    if (sessionId) {
      state.abortStream(sessionId);
    }
  }, [store]);

  const regenerate = useCallback(() => {
    const state = store.getState();
    const sessionId = state.activeSessionId;
    if (sessionId) {
      state.regenerate(sessionId);
    }
  }, [store]);

  const newTask = useCallback(() => {
    return store.getState().createSession();
  }, [store]);

  const clearGeneralSession = useCallback(() => {
    store.getState().clearGeneralSession();
  }, [store]);

  const switchSession = useCallback(
    (sessionId: string) => {
      store.getState().loadSession(sessionId);
    },
    [store],
  );

  const deleteSession = useCallback(
    (sessionId: string) => {
      store.getState().deleteSession(sessionId);
    },
    [store],
  );

  const pinSession = useCallback(
    (sessionId: string) => {
      store.getState().pinSession(sessionId);
    },
    [store],
  );

  const unpinSession = useCallback(
    (sessionId: string) => {
      store.getState().unpinSession(sessionId);
    },
    [store],
  );

  const refreshSessions = useCallback(() => {
    store.getState().refreshSessions();
  }, [store]);

  const markComplete = useCallback(
    (sessionId: string) => {
      store.getState().updateStatus(sessionId, 'completed');
    },
    [store],
  );

  const updateTaskStatus = useCallback(
    (sessionId: string, taskStatus: TaskStatus) => {
      store.getState().updateStatus(sessionId, taskStatus);
    },
    [store],
  );

  return useMemo(
    () => ({
      messages,
      sessions,
      currentSessionId,
      isGeneralSession,
      isSessionLoading,
      isSyncing,
      status,
      isStreaming,
      streamingMessageId,
      activeTool,
      sendMessage,
      abortStream,
      regenerate,
      newTask,
      clearGeneralSession,
      switchSession,
      deleteSession,
      pinSession,
      unpinSession,
      refreshSessions,
      markComplete,
      updateTaskStatus,
    }),
    [
      messages,
      sessions,
      currentSessionId,
      isGeneralSession,
      isSessionLoading,
      isSyncing,
      status,
      isStreaming,
      streamingMessageId,
      activeTool,
      sendMessage,
      abortStream,
      regenerate,
      newTask,
      clearGeneralSession,
      switchSession,
      deleteSession,
      pinSession,
      unpinSession,
      refreshSessions,
      markComplete,
      updateTaskStatus,
    ],
  );
}
