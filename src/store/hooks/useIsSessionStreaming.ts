/**
 * Hook to check if a specific session is currently streaming.
 * Returns a boolean (primitive), avoiding Zustand reference equality issues.
 */

import { getChatStore } from '@/features/app/bootstrap';
import { selectIsStreaming } from '../chat-store';

export function useIsSessionStreaming(sessionId: string): boolean {
  const store = getChatStore();
  return store(selectIsStreaming(sessionId));
}
