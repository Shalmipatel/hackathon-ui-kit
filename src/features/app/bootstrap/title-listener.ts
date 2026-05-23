/**
 * Title generation listener.
 * Subscribes to StreamClient 'done' events and triggers title generation
 * for eligible sessions (first user message, first assistant response).
 */

import type { ChatStore } from '@/store/chat-store';
import { getStreamClient, getChatRepo } from './providers';
import { GENERAL_SESSION_ID } from '@/types';
import type { StoreApi } from 'zustand';

type ChatStoreApi = StoreApi<ChatStore>;

export function setupTitleListener(storeApi: ChatStoreApi): () => void {
  const streamClient = getStreamClient();
  const chatRepo = getChatRepo();

  return streamClient.onEvent(async (event) => {
    if (event.type !== 'done') return;

    const sessionId = event.sessionId;
    if (sessionId === GENERAL_SESSION_ID) return;

    try {
      const session = await chatRepo.getSession(sessionId);
      if (!session || session.isGeneral || session.title === '#general') {
        return;
      }

      const userMessages = session.messages.filter((m) => m.role === 'user');
      const assistantMessages = session.messages.filter((m) => m.role === 'assistant');

      if (userMessages.length === 1 && assistantMessages.length <= 1) {
        const store = storeApi.getState();
        store.generateTaskTitle(sessionId, userMessages[0].content);
      }
    } catch (err) {
      console.warn('[TitleListener] Failed to check session for title generation:', err);
    }
  });
}
