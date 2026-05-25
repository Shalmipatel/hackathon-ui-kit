/**
 * Inline per-trip chat panel for the trips view right rail.
 *
 * Each trip owns a dedicated chat-store session (mapping persisted in
 * the travel store as `tripChatSessions`). When the active trip
 * changes we ensure a session exists for it and switch the chat store
 * over so messages, streaming state, etc. are all scoped to the trip.
 *
 * The panel is intentionally pared down vs. the full chat tab — no
 * file uploads, no kebab menu, just bubbles + a composer. Same
 * underlying primitives so behaviour (streaming, tool indicators) is
 * identical.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import type { ChatStore } from '@/store/chat-store';
import type { ChatMessage } from '@/types';
import {
  selectActiveIsStreaming,
  selectActiveTool,
  selectStreamingMessageId,
} from '@/store/chat-store';
import { useChatStore, getChatStore } from '@/features/app/bootstrap';
import { getChatRepo } from '@/features/app/bootstrap/providers';
import { useSendMessage } from '@/features/chat/useSendMessage';
import { ChatBubble } from '@/features/chat';
import { TypingIndicator } from '@/components';
import { useTravelStore, selectActiveTrip } from './travel-store';
import { formatTripRange } from './format';
import { BOOKING_CONTRACT_PROMPT } from './parser';

/* Module-scope stable empty array. Subscribing with `?? []` inline would
   return a fresh array on every render where there's no active session,
   which zustand interprets as a state change and re-renders forever. */
const EMPTY_MESSAGES: readonly ChatMessage[] = Object.freeze([]);

const Wrap = styled.aside`
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: #fff;
  border: 1px solid rgba(36, 36, 36, 0.07);
  border-radius: 18px;
  overflow: hidden;
  font-family: 'Inter', sans-serif;
`;

const Head = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(36, 36, 36, 0.06);
  gap: 10px;
  flex-shrink: 0;
`;

const HeadTitle = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

const HeadLabel = styled.div`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(36, 36, 36, 0.5);
`;

const HeadTrip = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: #242424;
  letter-spacing: -0.3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const NewBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid rgba(36, 36, 36, 0.12);
  background: transparent;
  color: rgba(36, 36, 36, 0.75);
  font-family: 'Inter', sans-serif;
  font-size: 11.5px;
  font-weight: 500;
  padding: 5px 10px;
  border-radius: 8px;
  cursor: pointer;
  flex-shrink: 0;

  &:hover {
    background: rgba(36, 36, 36, 0.04);
    color: #242424;
  }
`;

const Scroll = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;

  scrollbar-width: thin;
  scrollbar-color: rgba(36, 36, 36, 0.15) transparent;
  &::-webkit-scrollbar { width: 6px; }
  &::-webkit-scrollbar-thumb { background: rgba(36, 36, 36, 0.15); border-radius: 3px; }
`;

const Messages = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: auto;
`;

const EmptyState = styled.div`
  margin: auto 0;
  padding: 16px 12px;
  text-align: center;
  color: rgba(36, 36, 36, 0.55);
  font-size: 13px;
  line-height: 19px;

  strong {
    display: block;
    color: #242424;
    font-weight: 600;
    margin-bottom: 4px;
    font-size: 14px;
  }
`;

const QuickRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
  justify-content: center;
`;

const Quick = styled.button`
  border: 1px solid rgba(36, 36, 36, 0.15);
  background: rgba(255, 255, 255, 0.6);
  color: rgba(36, 36, 36, 0.85);
  font-family: 'Inter', sans-serif;
  font-size: 11.5px;
  font-weight: 500;
  padding: 5px 10px;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.12s;

  &:hover {
    background: #fff;
    border-color: rgba(36, 36, 36, 0.3);
  }
`;

const Composer = styled.form`
  display: flex;
  gap: 8px;
  padding: 12px 12px 14px 14px;
  border-top: 1px solid rgba(36, 36, 36, 0.06);
  flex-shrink: 0;
  background: #fff;
`;

const Input = styled.input`
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-family: inherit;
  font-size: 13.5px;
  color: #242424;

  &::placeholder {
    color: rgba(36, 36, 36, 0.4);
  }

  &:disabled {
    color: rgba(36, 36, 36, 0.4);
  }
`;

const Send = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 10px;
  background: #242424;
  color: #fff;
  cursor: pointer;
  flex-shrink: 0;
  transition: transform 0.12s;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

/** Build a compact trip summary the agent can refer to. */
function buildTripContextString(): string | null {
  const state = useTravelStore.getState();
  const trip = selectActiveTrip(state);
  if (!trip) return null;
  const bookings = state.bookings
    .filter((b) => b.tripId === trip.id)
    .sort((a, b) => {
      /* Untimed bookings have no `start`; fall back to dayKey + position. */
      const aKey = `${a.dayKey ?? ''}T${String(Math.floor((a.position ?? 0) / 3600)).padStart(2, '0')}`;
      const bKey = `${b.dayKey ?? ''}T${String(Math.floor((b.position ?? 0) / 3600)).padStart(2, '0')}`;
      const aFull = a.start ?? aKey;
      const bFull = b.start ?? bKey;
      return aFull.localeCompare(bFull);
    });
  const lines = [
    `Trip: ${trip.title} — ${trip.destination}`,
    `Dates: ${formatTripRange(trip)}`,
  ];
  if (trip.travelers && trip.travelers.length > 0) {
    lines.push(`Travelers: ${trip.travelers.join(', ')}`);
  }
  if (bookings.length === 0) {
    lines.push('No bookings yet for this trip.');
  } else {
    lines.push(`Bookings (${bookings.length}):`);
    bookings.forEach((b) => {
      const when = b.start
        ? `${b.start.slice(0, 10)} ${b.start.slice(11, 16)}`
        : `${b.dayKey} (untimed)`;
      const where =
        b.type === 'flight' || b.type === 'transport'
          ? `${b.from.name} → ${b.to.name}`
          : b.place.name;
      lines.push(
        `- [${b.type}] ${b.title} · ${when} · ${where}${b.confirmation ? ` · #${b.confirmation}` : ''}`,
      );
    });
  }
  return lines.join('\n');
}

/** Lazily create a chat-store session bound to a trip.
 *
 *  Key trick: right after creating the session we call
 *  chatRepo.updateTitle which (per chat-repository.ts:145) sets
 *  isAiTitled=true on the session-index entry. That flag is what
 *  syncWithBackend / reconcileOnResume look at to decide whether to
 *  re-run the LLM title generator. With isAiTitled=true from the very
 *  first moment, the sync paths skip our trip sessions entirely — no
 *  retry storms, no Maximum-update-depth loops in TabPage.
 *
 *  Session id is deterministic (`trip-<tripId>`) so:
 *   - Reloads find the same session via chatRepo.createSession's
 *     idempotent id path.
 *   - Stale Trip.chatSessionId values self-heal on next access.
 */
async function ensureTripChatSession(tripId: string): Promise<string | null> {
  const trip = useTravelStore.getState().trips.find((t) => t.id === tripId);
  if (!trip) return null;
  if (trip.chatSessionId) return trip.chatSessionId;

  const sessionId = `trip-${tripId}`;
  try {
    const chat = getChatStore();
    await chat.getState().createSession(sessionId);
    /* Set the title up-front so isAiTitled flips to true. This is the
       crucial step that prevents the sync loop. */
    await getChatRepo().updateTitle(sessionId, trip.title);
    await chat.getState().refreshSessions();
    useTravelStore.getState().updateTrip(tripId, { chatSessionId: sessionId });
    return sessionId;
  } catch (err) {
    console.warn('[trip-chat] ensure failed', err);
    return null;
  }
}

/** Activate the trip's session in chat-store. Creates one on first
 *  selection for trips that don't have one (seeded mocks). */
function useTripChatSync(): void {
  const activeTripId = useTravelStore((s) => s.activeTripId);

  useEffect(() => {
    if (!activeTripId) return;
    let cancelled = false;

    (async () => {
      const sessionId = await ensureTripChatSession(activeTripId);
      if (cancelled || !sessionId) return;
      const chat = getChatStore();
      try {
        /* Load BEFORE activating — otherwise activeSessionId briefly
           points at a session not in sessions{}, the messages
           selector falls back to its empty array, and any
           non-stabilised fallback causes a render loop. */
        await chat.getState().loadSession(sessionId);
        if (cancelled) return;
        chat.getState().setActiveSession(sessionId);
      } catch (err) {
        /* Stale id (cache cleared, etc.) — drop it and let the next
           tick recreate. */
        if (cancelled) return;
        console.warn('[trip-chat] loadSession failed, recreating', err);
        useTravelStore.getState().updateTrip(activeTripId, { chatSessionId: undefined });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTripId]);
}

interface TripChatPanelProps {
  onResetSession?: () => void;
}

export const TripChatPanel: React.FC<TripChatPanelProps> = () => {
  useTripChatSync();
  const trip = useTravelStore(selectActiveTrip);
  const activeTripId = useTravelStore((s) => s.activeTripId);
  /* Select the active session's messages with a stable empty-array
     fallback — see EMPTY_MESSAGES note up top. */
  const messages = useChatStore((s: ChatStore) => {
    const sid = s.activeSessionId;
    if (!sid) return EMPTY_MESSAGES;
    return (s.sessions[sid]?.messages as readonly ChatMessage[] | undefined) ?? EMPTY_MESSAGES;
  });
  const isStreaming = useChatStore(selectActiveIsStreaming);
  const streamingMessageId = useChatStore(selectStreamingMessageId);
  const activeTool = useChatStore(selectActiveTool);
  const sendMessage = useSendMessage();

  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  /* Auto-scroll to bottom on new messages / streaming tokens. */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'instant' });
  }, [messages, isStreaming]);

  const visibleMessages = useMemo(
    () => messages.filter((m) => !m.isHidden),
    [messages],
  );

  const showTypingIndicator =
    isStreaming && messages.length > 0 && messages[messages.length - 1].role === 'user';

  const send = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed || isStreaming) return;
    /* Attach the trip context ONLY on the first user message of the
       session. The agent's chat history retains it after that — no
       reason to re-paste it on every follow-up question. Also dropped
       the booking contract from the per-message preamble: the
       wanderbot-sync skill owns booking writes now. */
    const isFirstUserMessage = !messages.some((m) => m.role === 'user');
    const ctx = isFirstUserMessage ? buildTripContextString() : null;
    const composed = ctx
      ? `Context — my current trip:\n${ctx}\n\nMessage: ${trimmed}`
      : trimmed;
    sendMessage(composed);
    setText('');
  };

  const resetSession = async () => {
    if (!activeTripId) return;
    const trip = useTravelStore.getState().trips.find((t) => t.id === activeTripId);
    if (!trip) return;
    /* Generate a unique id so chat-store.createSession doesn't dedup
       us into another empty session (general or a sibling trip).
       Same isAiTitled flip pattern as ensureTripChatSession. */
    const newId = `trip-${activeTripId}-${Date.now()}`;
    try {
      const chat = getChatStore();
      await chat.getState().createSession(newId);
      await getChatRepo().updateTitle(newId, trip.title);
      await chat.getState().refreshSessions();
      useTravelStore.getState().updateTrip(activeTripId, { chatSessionId: newId });
      chat.getState().setActiveSession(newId);
    } catch (err) {
      console.warn('[trip-chat] reset failed', err);
    }
  };

  return (
    <Wrap>
      <Head>
        <HeadTitle>
          <HeadLabel>Trip chat</HeadLabel>
          <HeadTrip>{trip ? trip.title : 'No trip selected'}</HeadTrip>
        </HeadTitle>
        <NewBtn onClick={resetSession} title="Start a fresh chat for this trip">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            <path d="M3 21v-5h5" />
          </svg>
          New
        </NewBtn>
      </Head>
      <Scroll ref={scrollRef}>
        {visibleMessages.length === 0 ? (
          <EmptyState>
            <strong>Chat about this trip</strong>
            The assistant has full context for {trip ? trip.title : 'this trip'}.
            <QuickRow>
              <Quick onClick={() => send('Walk me through day 1 of this trip — any conflicts to know about?')}>Day 1 walkthrough</Quick>
              <Quick onClick={() => send('Suggest 3 dinner options near my first hotel.')}>Dinner ideas</Quick>
              <Quick onClick={() => send('What gaps are there in my itinerary that I should fill?')}>Find gaps</Quick>
            </QuickRow>
          </EmptyState>
        ) : (
          <Messages>
            {visibleMessages.map((msg, idx) => {
              const isLastAssistant =
                msg.role === 'assistant' &&
                !visibleMessages.slice(idx + 1).some((m) => m.role === 'assistant');
              const isCurrentlyStreaming = msg.id === streamingMessageId;
              return (
                <ChatBubble
                  key={msg.id}
                  message={msg}
                  isLastAssistant={isLastAssistant}
                  isStreaming={isCurrentlyStreaming}
                  activeTool={isCurrentlyStreaming ? activeTool : null}
                />
              );
            })}
            {showTypingIndicator && <TypingIndicator />}
            <div ref={bottomRef} />
          </Messages>
        )}
      </Scroll>
      <Composer
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={trip ? `Ask about ${trip.title.split(' ')[0]}…` : 'Pick a trip first'}
          disabled={!trip || isStreaming}
        />
        <Send type="submit" disabled={!text.trim() || isStreaming} aria-label="Send">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </Send>
      </Composer>
    </Wrap>
  );
};

export default TripChatPanel;
