/**
 * Rescan a single existing trip.
 *
 * Fires the `/wanderbot-sync rescan <tripId>` slash command. The
 * openclaw skill (see skills/wanderbot-sync.md) handles the rest —
 * reads the trip from RTDB, sweeps Gmail + browser sources focused
 * on that trip's window, and writes results back to RTDB. The
 * frontend picks up the writes on its next mount.
 *
 * The command goes into the trip's own chat session so the
 * conversation stays scoped per-trip.
 */

import { useCallback, useState } from 'react';
import { getChatStore } from '@/features/app/bootstrap';
import { useSendMessage } from '@/features/chat/useSendMessage';
import { toast } from '@/features/toast';
import { useTravelStore } from './travel-store';

export function useRescanTrip(): {
  rescan: (tripId: string) => void;
  rescanInFlight: boolean;
} {
  const sendMessage = useSendMessage();
  const [rescanInFlight, setRescanInFlight] = useState(false);

  const rescan = useCallback(
    (tripId: string) => {
      if (rescanInFlight) return;
      const trip = useTravelStore.getState().trips.find((t) => t.id === tripId);
      if (!trip) {
        toast({
          title: 'Trip not found',
          description: 'Pick a trip and try again.',
        });
        return;
      }

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

      sendMessage(`/wanderbot-sync rescan ${trip.id}`);

      setTimeout(() => setRescanInFlight(false), 12_000);
    },
    [rescanInFlight, sendMessage],
  );

  return { rescan, rescanInFlight };
}
