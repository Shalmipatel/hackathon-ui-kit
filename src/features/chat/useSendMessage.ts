/**
 * Hook for sending messages in the current session.
 */

import { useCallback } from 'react';
import { getChatStore } from '@/features/app/bootstrap';
import type { FileAttachment } from '@/types';
import { EVENTS, track } from '@/features/analytics';

export function useSendMessage(): (
  content: string,
  audioDataUrl?: string,
  attachments?: FileAttachment[],
  isHidden?: boolean,
) => Promise<void> {
  const store = getChatStore();

  return useCallback(
    async (content: string, audioDataUrl?: string, attachments?: FileAttachment[], isHidden?: boolean) => {
      const state = store.getState();
      const activeSessionId = state.activeSessionId;
      if (!activeSessionId) return;
      if (!isHidden) {
        track(EVENTS.CHAT_MESSAGE_SENT, {
          message_length: content.length,
          has_attachment: !!(attachments && attachments.length > 0),
        });
      }

      await state.sendMessage(activeSessionId, content, audioDataUrl, attachments, isHidden);
    },
    [store],
  );
}
