/**
 * Subscribes to the chat store and ingests any wanderbot booking blocks
 * the agent emits. Mount once at app start (TripsView is fine for the
 * hackathon — it's the default landing view, so ingestion is always
 * armed by the time the agent might reply).
 *
 * Detection is keyed off completed (= not-currently-streaming) assistant
 * messages, scanned once per id. We never re-process the same id, so a
 * partial token mid-stream that happens to contain the fence won't
 * double-fire.
 */

import { useEffect } from 'react';
import { getChatStore } from '@/features/app/bootstrap';
import { getChatRepo } from '@/features/app/bootstrap/providers';
import type { ChatStore } from '@/store';
import { toast } from '@/features/toast';
import { parseBookingsFromMessage, parseTripsFromMessage } from './parser';
import { useTravelStore } from './travel-store';
import type { Booking, Trip } from './types';

export function useBookingIngestion(): void {
  useEffect(() => {
    let chatStore;
    try {
      chatStore = getChatStore();
    } catch {
      /* Bootstrap not done yet — provider isn't initialized at module
         scope, so we silently bail. The hook re-runs on subsequent
         renders where bootstrap has finished. */
      return;
    }

    const processed = new Set<string>();

    /* Seed the processed set with the messages already in the store so
       a refresh doesn't re-ingest a payload that's already in the
       travel store. The first effect run is the only reliable signal
       for "this id was here before we started watching". */
    const initial = chatStore.getState();
    for (const session of Object.values(initial.sessions)) {
      for (const m of session.messages) {
        if (m.role === 'assistant') processed.add(m.id);
      }
    }

    /* Dev-only: expose a `simulateAgentReply(content)` helper on window so
       you can verify the contract / ingestion path without a live backend.
       Stripped from prod builds — `import.meta.env.DEV` is statically
       falsy and the whole block tree-shakes out. */
    if (import.meta.env.DEV) {
      (window as unknown as {
        __wanderbot?: { simulateAgentReply: (content: string) => Promise<void> };
      }).__wanderbot = {
        async simulateAgentReply(content: string) {
          const trips = parseTripsFromMessage(content);
          if (trips.trips.length > 0) {
            await applyTrips(trips.trips);
          }
          const parsed = parseBookingsFromMessage(content);
          if (parsed.bookings.length > 0) {
            applyBookings(parsed.bookings, 'dev-sim');
          } else if (trips.trips.length === 0) {
            console.warn('[wanderbot] simulate: no trips/bookings parsed', parsed.errors, trips.errors);
          }
        },
      };
    }

    const ingest = (state: ChatStore) => {
      for (const [sessionId, session] of Object.entries(state.sessions)) {
        const streamingId =
          session.stream.status === 'streaming' ? session.stream.messageId : null;
        for (const m of session.messages) {
          if (m.role !== 'assistant') continue;
          if (!m.id || processed.has(m.id)) continue;
          if (m.id === streamingId) continue;
          /* Mark as seen *before* we run the parser so a parser throw
             can't lead to repeated re-processing. */
          processed.add(m.id);
          /* Trip discovery first — agent may emit trips/v1 + bookings/v1
             in the same message. Trips need to exist before bookings
             can attach to them by tripId. Run in an async chain so
             session creation finishes before bookings upsert. */
          const content = m.content;
          void (async () => {
            const tripResult = parseTripsFromMessage(content);
            if (tripResult.trips.length > 0) {
              await applyTrips(tripResult.trips);
            }
            if (tripResult.errors.length > 0) {
              console.warn(
                '[wanderbot] trip payload had invalid entries:',
                tripResult.errors,
              );
            }
            const result = parseBookingsFromMessage(content);
            if (result.bookings.length > 0) {
              applyBookings(result.bookings, sessionId);
            }
            if (result.errors.length > 0) {
              console.warn(
                '[wanderbot] booking payload had invalid entries:',
                result.errors,
              );
            }
          })();
        }
      }
    };

    /* Subscribe to the whole store; the work is keyed by message id so
       repeated fires (e.g. on every streaming token) are cheap. */
    const unsubscribe = chatStore.subscribe(ingest);

    /* Also run once now in case messages landed between mount and
       subscribe (the seed above only protects against historical ids). */
    ingest(chatStore.getState());

    return () => {
      unsubscribe();
    };
  }, []);
}

function applyBookings(bookings: Booking[], sessionId: string): void {
  if (bookings.length === 0) return;
  const store = useTravelStore.getState();
  /* If the payload didn't carry a tripId, fall back to the active trip.
     This lets the agent emit `bookings/v1` blocks without re-stating the
     trip id when the user is mid-conversation about a known trip. */
  const activeTripId = store.activeTripId;
  const final = bookings.map((b) =>
    b.tripId ? b : { ...b, tripId: activeTripId ?? b.tripId },
  );
  for (const b of final) {
    if (!b.tripId) continue;
    store.upsertBooking(b);
  }
  toast({
    title:
      final.length === 1
        ? `Added booking · ${final[0].title}`
        : `Added ${final.length} bookings to your trip`,
    description:
      final.length === 1
        ? bookingSubtitle(final[0])
        : final.map((b) => b.title).slice(0, 3).join(' · '),
    duration: 4500,
  });
  /* Mark session for analytics consumer if desired — out of scope here. */
  void sessionId;
}

/** Add trips from an agent trips/v1 block. De-dupes by id (re-scans
 *  shouldn't pile up duplicates), creates a chat session per new
 *  trip using the same isAiTitled-flip pattern as ensureTripChatSession,
 *  and toasts a summary. */
async function applyTrips(incoming: Trip[]): Promise<void> {
  if (incoming.length === 0) return;
  const store = useTravelStore.getState();
  const existing = new Set(store.trips.map((t) => t.id));
  const fresh = incoming.filter((t) => !existing.has(t.id));
  if (fresh.length === 0) {
    toast({
      title: 'No new trips found',
      description: `${incoming.length} trip${incoming.length === 1 ? '' : 's'} already on your board.`,
    });
    return;
  }

  /* Create a chat session per new trip BEFORE persisting the trip
     itself, so the chatSessionId is on the Trip from the moment it
     lands in the store — matching how NewTripModal works. */
  let chat;
  try {
    chat = getChatStore();
  } catch {
    chat = null;
  }

  for (const trip of fresh) {
    if (chat) {
      const sessionId = `trip-${trip.id}`;
      try {
        await chat.getState().createSession(sessionId);
        await getChatRepo().updateTitle(sessionId, trip.title);
        await chat.getState().refreshSessions();
        trip.chatSessionId = sessionId;
      } catch (err) {
        console.warn('[wanderbot] trip session create failed', err);
      }
    }
    useTravelStore.getState().addTrip(trip);
  }

  toast({
    title:
      fresh.length === 1
        ? `Added trip · ${fresh[0].title}`
        : `Added ${fresh.length} trips`,
    description:
      fresh.length === 1
        ? `${fresh[0].destination} · ${fresh[0].startDate} → ${fresh[0].endDate}`
        : fresh.map((t) => t.title).slice(0, 3).join(' · '),
    duration: 4500,
  });
}

function bookingSubtitle(b: Booking): string {
  const when = b.start.slice(0, 10);
  switch (b.type) {
    case 'flight':
      return `${b.flightNumber ?? 'Flight'} · ${b.from.name} → ${b.to.name} · ${when}`;
    case 'hotel':
      return `${b.place.name} · ${when}`;
    case 'activity':
    case 'restaurant':
      return `${b.place.name} · ${when}`;
    case 'transport':
      return `${b.mode ?? 'Transport'} · ${b.from.name} → ${b.to.name}`;
  }
}
