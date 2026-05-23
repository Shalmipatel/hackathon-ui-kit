import { getChatStore } from '@/features/app/bootstrap';

/**
 * Returns true if a user message exists after the given assistant messageId
 * in the active session, indicating the interactive widget has been answered.
 */
export function useIsAnswered(messageId: string): boolean {
  const store = getChatStore();

  return store((state) => {
    const sessionId = state.activeSessionId;
    if (!sessionId) return false;

    const session = state.sessions[sessionId];
    if (!session) return false;

    const { messages } = session;
    const msgIndex = messages.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) return false;

    for (let i = msgIndex + 1; i < messages.length; i++) {
      if (messages[i].role === 'user') return true;
    }
    return false;
  });
}
