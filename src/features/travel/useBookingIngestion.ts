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
import { tripFingerprint, useTravelStore } from './travel-store';
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

/** Content fingerprint for booking dedup / enrichment. Confirmation
 *  number is the most reliable handle when present (PNRs are
 *  globally unique); fall back to type+title+date for things like
 *  agent-added activities or manual entries. tripId is in the key
 *  so the same flight number repeated across two trips stays
 *  distinct. */
function bookingFingerprint(b: Booking): string {
  if (b.confirmation && b.confirmation.trim()) {
    return `${b.tripId}|${b.type}|conf:${b.confirmation.trim().toLowerCase()}`;
  }
  /* `dayKey` is the authoritative day; fall back to `start`'s date
     prefix only for any legacy record that slipped through. */
  const day = b.dayKey || (b.start ? b.start.slice(0, 10) : '');
  return `${b.tripId}|${b.type}|${b.title.trim().toLowerCase()}|${day}`;
}

/** Enrichment merge: prefer incoming non-empty values, fall back to
 *  existing for anything the rescan didn't fill in. Keeps the existing
 *  id so the trip's booking list reference stays stable. Nested
 *  objects (place / from / to / cost) get shallow-merged so partial
 *  coords don't blow away a complete address. */
function enrichBooking(existing: Booking, incoming: Booking): Booking {
  const isEmpty = (v: unknown) =>
    v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  const merged: Record<string, unknown> = { ...existing };
  for (const [k, v] of Object.entries(incoming)) {
    if (k === 'id' || k === 'tripId') continue;
    if (isEmpty(v)) continue;
    if (
      v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      typeof merged[k] === 'object' &&
      merged[k] !== null
    ) {
      merged[k] = { ...(merged[k] as object), ...(v as object) };
    } else {
      merged[k] = v;
    }
  }
  /* Preserve provenance: a manually-created booking that gets
     enriched from an email shouldn't lose its "manual" badge unless
     the user-facing source changes meaningfully. Keep existing source
     if the incoming didn't specify. */
  if (!incoming.source) merged.source = existing.source;
  return merged as Booking;
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

  /* Build an index of existing bookings by fingerprint so a rescan
     can update an existing booking (filling in missing fields) rather
     than blindly inserting a duplicate under a new id. */
  const existingByFp = new Map<string, Booking>();
  for (const b of store.bookings) {
    existingByFp.set(bookingFingerprint(b), b);
  }

  let added = 0;
  let updated = 0;
  for (const b of final) {
    if (!b.tripId) continue;
    const fp = bookingFingerprint(b);
    const existing = existingByFp.get(fp);
    if (existing) {
      const merged = enrichBooking(existing, b);
      /* Skip the upsert if literally nothing changed — avoids spamming
         Firebase mirror writes on no-op rescans. */
      if (JSON.stringify(merged) === JSON.stringify(existing)) continue;
      store.upsertBooking(merged);
      updated++;
    } else {
      store.upsertBooking(b);
      added++;
    }
  }

  if (added === 0 && updated === 0) {
    toast({
      title: 'No booking changes',
      description: 'Everything the scan returned was already up to date.',
    });
  } else if (added > 0 && updated === 0) {
    toast({
      title:
        added === 1
          ? `Added booking · ${final[0].title}`
          : `Added ${added} bookings to your trip`,
      description:
        added === 1
          ? bookingSubtitle(final[0])
          : final.map((b) => b.title).slice(0, 3).join(' · '),
      duration: 4500,
    });
  } else if (updated > 0 && added === 0) {
    toast({
      title:
        updated === 1
          ? `Filled in details for 1 booking`
          : `Filled in details for ${updated} bookings`,
      description: 'Rescan added missing fields to existing entries.',
      duration: 4500,
    });
  } else {
    toast({
      title: `Added ${added}, updated ${updated} booking${added + updated === 1 ? '' : 's'}`,
      duration: 4500,
    });
  }
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
  const existingIds = new Set(store.trips.map((t) => t.id));
  const existingFingerprints = new Set(store.trips.map(tripFingerprint));
  /* Tombstones — trips the user explicitly deleted should never come
     back via a future scan, even under a fresh agent-generated id. */
  const deletedFingerprints = new Set(store.deletedTripFingerprints);
  /* Also dedupe within the incoming batch — the agent has been known to
     emit the same trip twice in a single block. Keep the first hit. */
  const seenFingerprints = new Set<string>();
  let suppressedByTombstone = 0;
  const fresh = incoming.filter((t) => {
    if (existingIds.has(t.id)) return false;
    const fp = tripFingerprint(t);
    if (existingFingerprints.has(fp)) return false;
    if (seenFingerprints.has(fp)) return false;
    if (deletedFingerprints.has(fp)) {
      suppressedByTombstone++;
      return false;
    }
    seenFingerprints.add(fp);
    return true;
  });
  if (suppressedByTombstone > 0) {
    console.warn(
      `[wanderbot] suppressed ${suppressedByTombstone} previously-deleted trip(s) from re-ingestion.`,
    );
  }
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
  const when = b.dayKey || (b.start ? b.start.slice(0, 10) : '');
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
