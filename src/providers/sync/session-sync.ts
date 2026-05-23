import type {
  ISessionSyncClient,
  IChatRepository,
  ChatSessionSummary,
  ChatMessage,
} from '@/types';
import { GENERAL_SESSION_ID } from '@/types';
import { toClientKey, isUserSession } from './session-key.util';
import { mapRemoteMessages, extractTitleFromMessages } from './message-mapper.util';

/**
 * Placeholder title used by `syncSessionIndex` for newly-discovered remote
 * sessions whose history (and therefore real title) has not yet been fetched.
 * The real title is acquired organically when the user opens the session via
 * `loadSession` -> `loadFromBackend` (which writes the message-derived title
 * through the save path).
 */
export const PLACEHOLDER_NEW_SESSION_TITLE = 'New session';

export class SessionSync {
  constructor(
    private syncClient: ISessionSyncClient,
    private chatRepo: IChatRepository,
  ) {}

  /**
   * Reconcile local session index with the backend.
   *
   * @param streamingSessionIds - IDs of sessions currently streaming (protected from staleness marking)
   * @returns merged session list to replace sessionIndex in the store
   */
  async reconcile(streamingSessionIds: string[]): Promise<ChatSessionSummary[]> {
    const remoteSessions = await this.syncClient.listSessions();
    const userSessions = remoteSessions.filter((s) => isUserSession(s.key));

    const remoteByClientKey = new Map(
      userSessions
        .map((s) => {
          const clientKey = toClientKey(s.key);
          return clientKey ? ([clientKey, s] as const) : null;
        })
        .filter((e): e is NonNullable<typeof e> => e !== null),
    );

    const localIndex = await this.chatRepo.getSessions();
    const streamingSet = new Set(streamingSessionIds);
    const merged: ChatSessionSummary[] = [];
    const matchedRemoteKeys = new Set<string>();

    for (const local of localIndex) {
      const remote = remoteByClientKey.get(local.id);

      if (remote) {
        matchedRemoteKeys.add(local.id);
        const isStale = remote.updatedAt > local.updatedAt;
        const neverSynced = !local.isSynced;
        const isStreaming = streamingSet.has(local.id);

        merged.push({
          ...local,
          needsRefresh: (isStale || neverSynced) && !isStreaming ? true : local.needsRefresh,
          isSynced: true,
        });
      } else if (local.isSynced && !local.isGeneral) {
        await this.chatRepo.deleteSession(local.id);
      } else {
        merged.push(local);
      }
    }

    for (const [clientKey, remote] of remoteByClientKey) {
      if (matchedRemoteKeys.has(clientKey)) continue;
      if (clientKey === GENERAL_SESSION_ID) continue;

      let title: string;
      try {
        const history = await this.syncClient.getSessionHistory(clientKey);
        title = extractTitleFromMessages(history.messages);
      } catch {
        title = 'Restored session';
      }

      const summary: ChatSessionSummary = {
        id: clientKey,
        title,
        createdAt: remote.updatedAt,
        updatedAt: remote.updatedAt,
        isSynced: true,
        needsRefresh: true,
      };
      merged.push(summary);
    }

    const general = merged.filter((s) => s.isGeneral);
    const tasks = merged.filter((s) => !s.isGeneral).sort((a, b) => b.updatedAt - a.updatedAt);

    return [...general, ...tasks];
  }

  /**
   * Sync the local session index with the backend. Index-only: does NOT fetch
   * per-session history. New remote-only rows are inserted with a placeholder
   * title; their real content (and thus title) is fetched lazily when the user
   * opens them via loadSession() -> loadFromBackend().
   *
   * Becomes the default index-sync method once the backend exposes session
   * titles in the listSessions response (replacing the current heavyweight
   * reconcile() which fetches history per new session purely for title text).
   *
   * Differs from reconcile():
   *   - No per-new-session getSessionHistory() call (no title extraction).
   *   - Does not mutate `needsRefresh` on existing rows (V1 read paths ignore it).
   *   - Does not delete orphaned local sessions (resume is read-mostly).
   *
   * What it DOES update on existing rows:
   *   - `isSynced: true` when the row is matched in the remote list. This is
   *     necessary so that a future reconcile() correctly detects server-side
   *     deletion (its else-branch is gated on `local.isSynced && !local.isGeneral`).
   *     Without this promotion, a session created locally and later seen
   *     remotely could drift into a "phantom" state if the server later
   *     deletes it.
   */
  async syncSessionIndex(): Promise<ChatSessionSummary[]> {
    const remoteSessions = await this.syncClient.listSessions();
    const userSessions = remoteSessions.filter((s) => isUserSession(s.key));

    const remoteByClientKey = new Map(
      userSessions
        .map((s) => {
          const clientKey = toClientKey(s.key);
          return clientKey ? ([clientKey, s] as const) : null;
        })
        .filter((e): e is NonNullable<typeof e> => e !== null),
    );

    const localIndex = await this.chatRepo.getSessions();
    // Matched local rows are promoted to isSynced:true; unmatched are passed
    // through unchanged. No deletion (intentional — see docstring).
    const merged: ChatSessionSummary[] = localIndex.map((local) =>
      remoteByClientKey.has(local.id) ? { ...local, isSynced: true } : local,
    );
    const localIds = new Set(localIndex.map((s) => s.id));

    for (const [clientKey, remote] of remoteByClientKey) {
      if (localIds.has(clientKey)) continue;
      if (clientKey === GENERAL_SESSION_ID) continue;

      merged.push({
        id: clientKey,
        title: PLACEHOLDER_NEW_SESSION_TITLE,
        createdAt: remote.updatedAt,
        updatedAt: remote.updatedAt,
        isSynced: true,
        needsRefresh: false,
      });
    }

    const general = merged.filter((s) => s.isGeneral);
    const tasks = merged.filter((s) => !s.isGeneral).sort((a, b) => b.updatedAt - a.updatedAt);

    return [...general, ...tasks];
  }

  /**
   * Load session messages from the backend and cache locally.
   *
   * @returns the mapped ChatMessage array
   */
  async loadFromBackend(sessionId: string): Promise<ChatMessage[]> {
    const history = await this.syncClient.getSessionHistory(sessionId);
    const messages = mapRemoteMessages(history.messages);

    const existing = await this.chatRepo.getSession(sessionId);
    if (existing) {
      await this.chatRepo.updateMessages(sessionId, messages);
    } else {
      const index = await this.chatRepo.getSessions();
      const indexEntry = index.find((s) => s.id === sessionId);
      const hasRealTitle = indexEntry?.title && indexEntry.title !== PLACEHOLDER_NEW_SESSION_TITLE;
      const title = hasRealTitle ? indexEntry.title : extractTitleFromMessages(history.messages);
      const now = Date.now();
      await this.chatRepo.saveSession({
        id: sessionId,
        title,
        messages,
        createdAt: now,
        updatedAt: now,
      });
    }

    return messages;
  }
}
