/**
 * Persistence setup for automatic state synchronization with storage.
 * Uses debounced writes for general changes and immediate writes for critical events.
 */

import type { ChatStore, SessionState } from '@/store/chat-store';
import { getChatRepo } from './providers';
import type { StoreApi } from 'zustand';

const DEBOUNCE_MS = 500;

type ChatStoreApi = StoreApi<ChatStore>;

export function setupPersistence(storeApi: ChatStoreApi): () => void {
  const chatRepo = getChatRepo();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const pendingWrites = new Map<string, Promise<void>>();

  async function persistSession(sessionId: string): Promise<void> {
    await pendingWrites.get(sessionId);

    const store = storeApi.getState();
    const session = store.sessions[sessionId];
    if (!session) return;

    if (session.stream.status === 'streaming') return;

    const writePromise = chatRepo.updateMessages(sessionId, session.messages);
    pendingWrites.set(sessionId, writePromise);

    try {
      await writePromise;
    } finally {
      pendingWrites.delete(sessionId);
    }
  }

  let prevSessions: Record<string, SessionState> = storeApi.getState().sessions;
  let prevStatuses: Record<string, string> = Object.fromEntries(
    Object.entries(prevSessions).map(([id, s]) => [id, s.stream.status]),
  );

  const unsubscribe = storeApi.subscribe((state) => {
    const sessions = state.sessions;
    const statuses = Object.fromEntries(
      Object.entries(sessions).map(([id, s]) => [id, s.stream.status]),
    );

    const changedIds = Object.keys(sessions).filter(
      (id) => sessions[id] !== prevSessions[id],
    );

    if (changedIds.length > 0) {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        for (const id of changedIds) {
          const session = sessions[id];
          if (session && session.stream.status !== 'streaming') {
            await persistSession(id);
          }
        }
      }, DEBOUNCE_MS);
    }

    for (const [id, status] of Object.entries(statuses)) {
      const prevStatus = prevStatuses[id];
      if (
        (status === 'idle' && prevStatus === 'streaming') ||
        (status === 'error' && prevStatus === 'streaming')
      ) {
        persistSession(id);
      }
    }

    prevSessions = sessions;
    prevStatuses = statuses;
  });

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    unsubscribe();
  };
}
