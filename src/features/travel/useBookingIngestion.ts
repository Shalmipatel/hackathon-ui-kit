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
          const parsed = parseBookingsFromMessage(content);
          if (trips.trips.length > 0) {
            const referenced = new Set(parsed.bookings.map((b) => b.tripId).filter(Boolean));
            const tripsWithEvents = trips.trips.filter((t) => referenced.has(t.id));
            if (tripsWithEvents.length > 0) {
              await applyTrips(tripsWithEvents);
            }
            const dropped = trips.trips.length - tripsWithEvents.length;
            if (dropped > 0) {
              console.warn(`[wanderbot] simulate: dropped ${dropped} trip(s) with no bookings`);
            }
          }
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
          /* Trips and bookings get parsed together from the same
             message — a trip with no events isn't a real trip, just
             an LLM placeholder, so we drop any trip whose id isn't
             referenced by at least one booking in this same payload. */
          const content = m.content;
          void (async () => {
            const tripResult = parseTripsFromMessage(content);
            const bookingResult = parseBookingsFromMessage(content);
            if (tripResult.errors.length > 0) {
              console.warn(
                '[wanderbot] trip payload had invalid entries:',
                tripResult.errors,
              );
            }
            if (bookingResult.errors.length > 0) {
              console.warn(
                '[wanderbot] booking payload had invalid entries:',
                bookingResult.errors,
              );
            }

            if (tripResult.trips.length > 0) {
              const referencedTripIds = new Set(
                bookingResult.bookings.map((b) => b.tripId).filter(Boolean),
              );
              const tripsWithEvents = tripResult.trips.filter((t) =>
                referencedTripIds.has(t.id),
              );
              const dropped = tripResult.trips.length - tripsWithEvents.length;
              if (dropped > 0) {
                console.warn(
                  `[wanderbot] dropped ${dropped} trip(s) with no associated bookings — ignoring placeholder trips.`,
                );
              }
              if (tripsWithEvents.length > 0) {
                await applyTrips(tripsWithEvents);
              }
            }

            if (bookingResult.bookings.length > 0) {
              applyBookings(bookingResult.bookings, sessionId);
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
/** Content fingerprint for trip dedup. The agent regenerates ids
 *  every scan (no stable mapping from email → id), so id matching
 *  alone lets the same trip land multiple times. Title-lower + dates
 *  is stable enough: the same Tokyo Jun 12-22 trip always hashes the
 *  same regardless of what id the LLM picked. */
function tripFingerprint(t: Pick<Trip, 'title' | 'startDate' | 'endDate'>): string {
  return `${t.title.trim().toLowerCase()}|${t.startDate}|${t.endDate}`;
}

async function applyTrips(incoming: Trip[]): Promise<void> {
  if (incoming.length === 0) return;
  const store = useTravelStore.getState();
  const existingIds = new Set(store.trips.map((t) => t.id));
  const existingFingerprints = new Set(store.trips.map(tripFingerprint));
  /* Also dedupe within the incoming batch — the agent has been known to
     emit the same trip twice in a single block. Keep the first hit. */
  const seenFingerprints = new Set<string>();
  const fresh = incoming.filter((t) => {
    if (existingIds.has(t.id)) return false;
    const fp = tripFingerprint(t);
    if (existingFingerprints.has(fp)) return false;
    if (seenFingerprints.has(fp)) return false;
    seenFingerprints.add(fp);
    return true;
  });
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
