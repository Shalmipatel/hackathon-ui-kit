/**
 * Mirrors per-trip chat sessions from the local chat-store into
 * Firebase RTDB at `/wanderbot/chat_sessions/<tripId>/<messageId>`.
 *
 * Why this exists: the web chat-store persists to localStorage, which
 * is per-browser. The SwiftUI app subscribes to RTDB for chat history,
 * so without a mirror, iOS opens a chat tab and sees nothing even
 * though the conversation already has messages on web.
 *
 * What it does:
 *   - On mount, backfills every trip that has a `chatSessionId` —
 *     reads its local session messages and PUTs each into RTDB.
 *   - Subscribes to the chat-store so subsequent message changes
 *     (assistant streaming complete, new user turn, etc.) get pushed
 *     to RTDB too.
 *
 * Mirror is intentionally one-way (web → RTDB). The web app keeps
 * displaying from its existing localStorage path; iOS reads from RTDB.
 * Reverse direction (RTDB → web) is a follow-up.
 */
import { useEffect, useRef } from 'react';
import { useChatStore, getChatStore } from '@/features/app/bootstrap';
import { getChatRepo } from '@/features/app/bootstrap/providers';
import { useTravelStore } from './travel-store';
import { isFirebaseConfigured, mirrorChatMessageRemote, type MirroredChatMessage } from './firebase';
import type { ChatMessage } from '@/types';
import type { Trip } from './types';

function toMirror(message: ChatMessage): MirroredChatMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
    isHidden: message.isHidden,
  };
}

/** True when these two messages have the same content + flags worth
 *  syncing. Used to short-circuit redundant writes during streaming. */
function messagesEqual(a: ChatMessage, b: ChatMessage): boolean {
  return (
    a.id === b.id &&
    a.role === b.role &&
    a.content === b.content &&
    a.timestamp === b.timestamp &&
    !!a.isHidden === !!b.isHidden
  );
}

function bootstrappedKey(): string {
  return '__wanderbot_chat_mirror_done__';
}

export function useChatRTDBMirror(): void {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    if (!isFirebaseConfigured()) return;
    ran.current = true;

    const chatStore = getChatStore();
    /** sessionId → tripId. The bridge between chat-store keys
     *  (`trip-<id>` etc.) and the per-trip RTDB path. */
    const sessionToTrip = new Map<string, string>();
    /** sessionId → last-mirrored message snapshot keyed by id.
     *  Lets us PUT only the rows that actually changed. */
    const lastSeen = new Map<string, Map<string, ChatMessage>>();

    /** Returns session ids that are new since the last call so we
     *  only backfill the ones we haven't already pushed. */
    const rebuildSessionMap = (trips: Trip[]): string[] => {
      const before = new Set(sessionToTrip.keys());
      sessionToTrip.clear();
      const fresh: string[] = [];
      for (const trip of trips) {
        if (trip.chatSessionId) {
          sessionToTrip.set(trip.chatSessionId, trip.id);
          if (!before.has(trip.chatSessionId)) fresh.push(trip.chatSessionId);
        }
      }
      return fresh;
    };

    const mirrorSession = async (sessionId: string, messages: readonly ChatMessage[]) => {
      const tripId = sessionToTrip.get(sessionId);
      if (!tripId) return;
      const seen = lastSeen.get(sessionId) ?? new Map<string, ChatMessage>();
      const writes: Promise<void>[] = [];
      const nextSeen = new Map<string, ChatMessage>();
      for (const message of messages) {
        nextSeen.set(message.id, message);
        const prev = seen.get(message.id);
        if (!prev || !messagesEqual(prev, message)) {
          writes.push(mirrorChatMessageRemote(tripId, toMirror(message)));
        }
      }
      lastSeen.set(sessionId, nextSeen);
      await Promise.all(writes);
    };

    const backfillSession = async (sessionId: string) => {
      const repo = getChatRepo();
      try {
        const session = await repo.getSession(sessionId);
        if (!session) return;
        await mirrorSession(sessionId, session.messages);
      } catch (err) {
        console.warn('[chat-mirror] backfill', sessionId, err);
      }
    };

    const backfillAll = async (sessionIds: string[]) => {
      if (sessionIds.length === 0) return;
      console.log('[chat-mirror] backfilling', sessionIds.length, 'session(s)');
      await Promise.all(sessionIds.map(backfillSession));
    };

    /* Initial trips snapshot — useFirebaseSync may already have
       populated it, or may still be in flight. Either way we run
       backfill for whatever's there now, then the travel subscriber
       below catches anything that lands later. */
    void backfillAll(rebuildSessionMap(useTravelStore.getState().trips));

    /* Trips change over time — useFirebaseSync hydrates from RTDB
       after mount; seeded trips pick up chatSessionIds on first
       chat-open. Each new session id triggers its own backfill. */
    const unsubTravel = useTravelStore.subscribe((state, prev) => {
      if (state.trips === prev.trips) return;
      const fresh = rebuildSessionMap(state.trips);
      void backfillAll(fresh);
    });

    /* Live mirror — push to RTDB whenever a watched session's
       messages change. Subscribe to the whole store; mirrorSession
       diffs against `lastSeen` so writes only fire for rows that
       actually moved. */
    const unsubChat = chatStore.subscribe((state) => {
      for (const [sessionId] of sessionToTrip.entries()) {
        const session = state.sessions[sessionId];
        if (!session) continue;
        void mirrorSession(sessionId, session.messages);
      }
    });

    /* Persist a tiny "we ran today" flag so dev hot reloads don't
       hammer RTDB with redundant backfills. The flag is informational
       — the per-message diff already keeps writes cheap. */
    try { localStorage.setItem(bootstrappedKey(), String(Date.now())); } catch {}

    return () => {
      unsubTravel();
      unsubChat();
    };
  }, []);
}
