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

      /* Send the agent a compact picture of what we currently have for
         each booking — including which fields are missing — so it
         knows what to fill in. The client merges by fingerprint
         (confirmation or type+title+date), so re-emitting an existing
         booking with more details is exactly what we want. */
      const knownBookings = bookings.length
        ? bookings
            .map((b) => {
              const tag = b.confirmation ? `#${b.confirmation}` : '(no confirmation)';
              const missing: string[] = [];
              if (!b.confirmation) missing.push('confirmation');
              if (!b.cost) missing.push('cost');
              if (b.type === 'flight' || b.type === 'transport') {
                if (!b.from?.lat || !b.from?.lng) missing.push('from coords');
                if (!b.to?.lat || !b.to?.lng) missing.push('to coords');
              } else {
                if (!b.place?.lat || !b.place?.lng) missing.push('place coords');
                if (!b.place?.address) missing.push('place address');
              }
              if (!b.end) missing.push('end time');
              const missingNote = missing.length
                ? ` — MISSING: ${missing.join(', ')}`
                : ' — looks complete';
              return `- [${b.type}] ${b.title} ${tag} (${b.start.slice(0, 10)})${missingNote}`;
            })
            .join('\n')
        : '_(no bookings yet — this is a brand new trip, find everything you can)_';

      const prompt = [
        `RESCAN — goal is to FILL IN MISSING DATA for one existing trip. Do NOT emit a trips/v1 block; the trip already exists. Emit bookings/v1 entries with tripId="${trip.id}".`,
        '',
        `Trip: ${trip.title}`,
        `Destination: ${trip.destination}`,
        `Dates: ${formatTripRange(trip)}`,
        `Trip id: ${trip.id}`,
        '',
        'Current bookings on this trip (with what\'s missing):',
        knownBookings,
        '',
        'TASK — both at once:',
        '1. For each EXISTING booking above with "MISSING:" notes, find the missing fields from the sources below and re-emit the booking with the complete data. Use the same confirmation number / title / date so the client merges with the existing entry instead of duplicating it.',
        '2. Look for any NEW bookings for this trip you haven\'t added yet.',
        '',
        'Sources to check (all of them, not just Gmail):',
        '- Gmail: search for confirmations dated within the trip window',
        '- Airbnb: https://www.airbnb.com/trips/v1',
        '- Booking.com: https://secure.booking.com/myreservations.html',
        '- Airline / hotel "My trips" pages for any session that\'s logged in',
        '- Google Calendar events overlapping the trip dates',
        '- OpenTable / Resy reservations during the trip',
        '',
        'Matching rules so the client can merge correctly:',
        '- If a booking has a confirmation number, keep using the SAME confirmation when re-emitting (this is how the client identifies the same booking).',
        '- If no confirmation, the client matches on (type, title-lowercased, start-date). Keep the title + start date stable.',
        '- Always include lat/lng — without them the booking can\'t appear on the map.',
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
