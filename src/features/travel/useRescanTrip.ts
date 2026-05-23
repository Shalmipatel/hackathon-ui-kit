/**
 * Rescan a single existing trip for new bookings.
 *
 * Different from useScanForTrips: that one is a discovery pass that
 * may surface entirely new trips. This one is scoped — it tells the
 * agent "this trip exists, don't make a new one, just add any new
 * bookings you find for it".
 *
 * Mechanism:
 *  1. Switch chat-store to the trip's dedicated session so the
 *     conversation lands in the right place.
 *  2. Fire /reset so prior context (e.g. earlier scan transcripts)
 *     doesn't bleed into the rescan.
 *  3. Send a focused prompt with the trip's id + the fingerprints of
 *     every booking the trip already owns. Agent emits a bookings/v1
 *     block with tripId set; useBookingIngestion picks it up.
 */

import { useCallback, useState } from 'react';
import { getChatStore } from '@/features/app/bootstrap';
import { useSendMessage } from '@/features/chat/useSendMessage';
import { toast } from '@/features/toast';
import { useTravelStore } from './travel-store';
import { BOOKING_CONTRACT_PROMPT } from './parser';
import { formatTripRange } from './format';

export function useRescanTrip(): {
  rescan: (tripId: string) => void;
  rescanInFlight: boolean;
} {
  const sendMessage = useSendMessage();
  const [rescanInFlight, setRescanInFlight] = useState(false);

  const rescan = useCallback(
    (tripId: string) => {
      if (rescanInFlight) return;
      const state = useTravelStore.getState();
      const trip = state.trips.find((t) => t.id === tripId);
      if (!trip) {
        toast({
          title: 'Trip not found',
          description: 'Pick a trip and try again.',
        });
        return;
      }
      const bookings = state.bookings.filter((b) => b.tripId === tripId);

      /* Route the rescan into the trip's own session so the
         conversation stays scoped. If we don't have a session id yet
         (e.g. agent-generated trip from a Firebase hydrate before
         ensureTripChatSession ran), fall through and let
         useSendMessage drop it into the current active session. */
      if (trip.chatSessionId) {
        try {
          getChatStore().getState().setActiveSession(trip.chatSessionId);
        } catch (err) {
          console.warn('[rescan-trip] setActiveSession failed', err);
        }
      }

      setRescanInFlight(true);
      toast({
        title: `Rescanning ${trip.title}…`,
        description: 'Looking for new bookings for this trip.',
        duration: 4000,
      });

      sendMessage('/reset');

      /* Compact fingerprint so the agent can skip duplicates without
         us shipping the whole booking object. Use confirmation if
         present, else title — both stable enough for dedup. */
      const knownBookings = bookings.length
        ? bookings
            .map((b) => {
              const tag = b.confirmation ? `#${b.confirmation}` : b.title;
              return `- [${b.type}] ${tag} (${b.start.slice(0, 10)})`;
            })
            .join('\n')
        : '_(none yet)_';

      const prompt = [
        `RESCAN — scoped to ONE existing trip. Do NOT emit a trips/v1 block; the trip already exists. Only emit bookings/v1 entries with tripId="${trip.id}" for any NEW bookings you find.`,
        '',
        `Trip: ${trip.title}`,
        `Destination: ${trip.destination}`,
        `Dates: ${formatTripRange(trip)}`,
        `Trip id: ${trip.id}`,
        '',
        'Already-known bookings (skip these, do NOT re-emit):',
        knownBookings,
        '',
        'Look across ALL my connected sources for new bookings for THIS trip:',
        '- Gmail: search for confirmations dated within the trip window',
        '- Airbnb: https://www.airbnb.com/trips/v1',
        '- Booking.com: https://secure.booking.com/myreservations.html',
        '- Airline / hotel "My trips" pages for any session that\'s logged in',
        '- Google Calendar events overlapping the trip dates',
        '- OpenTable / Resy reservations during the trip',
        '',
        'For each new booking, emit it with tripId set to the value above. Skip anything that matches an already-known confirmation or title+date pair.',
        '',
        BOOKING_CONTRACT_PROMPT,
      ].join('\n');

      sendMessage(prompt);

      /* Best-effort timeout so the button doesn't stay locked
         forever. Ingestion will surface real results regardless. */
      setTimeout(() => setRescanInFlight(false), 12_000);
    },
    [rescanInFlight, sendMessage],
  );

  return { rescan, rescanInFlight };
}
