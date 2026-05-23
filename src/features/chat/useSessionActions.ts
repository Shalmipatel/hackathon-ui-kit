/**
 * Hook for session management actions.
 */

import { useCallback, useMemo } from 'react';
import { getChatStore } from '@/features/app/bootstrap';
import type { TaskStatus } from '@/types';

export interface UseSessionActionsReturn {
  switchSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  pinSession: (sessionId: string) => Promise<void>;
  unpinSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, newTitle: string) => Promise<void>;
  reorderPinnedSessions: (orderedIds: string[]) => Promise<void>;
  updateStatus: (sessionId: string, status: TaskStatus) => Promise<void>;
  markComplete: (sessionId: string) => Promise<void>;
  refreshSessions: () => Promise<void>;
}

export function useSessionActions(): UseSessionActionsReturn {
  const store = getChatStore();

  const switchSession = useCallback(
    async (sessionId: string) => {
      const state = store.getState();
      await state.loadSession(sessionId);
    },
    [store],
  );

  const deleteSession = useCallback(
    async (sessionId: string) => {
      const state = store.getState();
      await state.deleteSession(sessionId);
    },
    [store],
  );

  const pinSession = useCallback(
    async (sessionId: string) => {
      const state = store.getState();
      await state.pinSession(sessionId);
    },
    [store],
  );

  const unpinSession = useCallback(
    async (sessionId: string) => {
      const state = store.getState();
      await state.unpinSession(sessionId);
    },
    [store],
  );

  const renameSession = useCallback(
    async (sessionId: string, newTitle: string) => {
      const state = store.getState();
      await state.renameSession(sessionId, newTitle);
    },
    [store],
  );

  const reorderPinnedSessions = useCallback(
    async (orderedIds: string[]) => {
      const state = store.getState();
      await state.reorderPinnedSessions(orderedIds);
    },
    [store],
  );

  const updateStatus = useCallback(
    async (sessionId: string, status: TaskStatus) => {
      const state = store.getState();
      await state.updateStatus(sessionId, status);
    },
    [store],
  );

  const markComplete = useCallback(
    async (sessionId: string) => {
      const state = store.getState();
      await state.updateStatus(sessionId, 'completed');
    },
    [store],
  );

  const refreshSessions = useCallback(async () => {
    const state = store.getState();
    await state.refreshSessions();
  }, [store]);

  return useMemo(
    () => ({
      switchSession,
      deleteSession,
      pinSession,
      unpinSession,
      renameSession,
      reorderPinnedSessions,
      updateStatus,
      markComplete,
      refreshSessions,
    }),
    [switchSession, deleteSession, pinSession, unpinSession, renameSession, reorderPinnedSessions, updateStatus, markComplete, refreshSessions],
  );
}
