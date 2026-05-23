/**
 * Hook for accessing the session list for the sidebar.
 */

import { useMemo } from 'react';
import { getChatStore } from '@/features/app/bootstrap';
import { selectSessionList } from '../chat-store';
import type { ChatSessionSummary } from '@/types';

export interface UseSessionListReturn {
  sessions: ChatSessionSummary[];
  activeSessionId: string | null;
}

export function useSessionList(): UseSessionListReturn {
  const store = getChatStore();

  const sessions = store(selectSessionList);
  const activeSessionId = store((state) => state.activeSessionId);

  return useMemo(
    () => ({
      sessions,
      activeSessionId,
    }),
    [sessions, activeSessionId],
  );
}
