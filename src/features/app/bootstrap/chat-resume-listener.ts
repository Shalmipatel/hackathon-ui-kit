/**
 * App-scoped resume listener for the chat domain.
 *
 * Subscribes to the lifecycle RefreshCoordinator. When the coordinator fans
 * out a resume event the listener delegates to `chatStore.reconcileOnResume()`,
 * which:
 *   1. self-heals stale `stream.status` flags using the authoritative
 *      `streamClient.activeStreams` set.
 *   2. syncs the session index (no per-session history fetch; placeholder
 *      titles for new rows).
 *   3. refreshes the currently-active session's content (skipped if that
 *      session is currently streaming).
 *
 * Why bootstrap-owned (vs. `useResume` inside `useChat`):
 *   - `useChat` is mounted/unmounted per route. Resume reconciliation should
 *     be app-scoped so a session always reconciles regardless of which screen
 *     the user lands on after coming back from background.
 *   - One stable listener id (`'chat/resume'`) avoids React strict-mode
 *     mount/unmount churn.
 *   - Mirrors existing sibling listeners (data-change-listener,
 *     cron-session-listener) which take `storeApi` as a parameter.
 *
 * Throttle policy:
 *   - `minHiddenMs: 30_000` — sub-30s tab switches don't trigger a sidebar
 *     fetch (cheap to skip; user hasn't been gone long enough for state to
 *     drift meaningfully).
 *   - `minIntervalMs: 60_000` — at most once per minute. `force: true` (e.g.
 *     manual DevTools trigger) bypasses both `minHiddenMs` and `minIntervalMs`
 *     by design; the coordinator's 250 ms global force-debounce remains the
 *     only spam guard.
 *   - No `predicate` — streaming protection is structural: the action
 *     internally consults `streamClient.getActiveSessionIds()` for the
 *     active-session refresh skip, and the input layer disables `ChatInput`
 *     while `isSyncing` is true.
 */

import type { StoreApi, UseBoundStore } from 'zustand';
import type { ChatStore } from '@/store/chat-store';
import { getRefreshCoordinator } from '@/providers/lifecycle';

type ChatStoreInstance = UseBoundStore<StoreApi<ChatStore>>;

export function setupChatResumeListener(chatStore: ChatStoreInstance): () => void {
  const coordinator = getRefreshCoordinator();

  return coordinator.register(
    async () => {
      try {
        await chatStore.getState().reconcileOnResume();
      } catch (err) {
        console.warn('[ChatResumeListener] reconcileOnResume threw:', err);
      }
    },
    {
      id: 'chat/resume',
      minHiddenMs: 30_000,
      minIntervalMs: 60_000,
    },
  );
}
