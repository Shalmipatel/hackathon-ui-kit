/**
 * Trigger a trip-discovery scan via the agent.
 *
 * The "+ New" button isn't a manual form anymore — it's an ask to
 * the agent: "look at my connections and tell me what trips you can
 * find". The agent replies with a wanderbot trips/v1 block (and
 * optionally bookings/v1 per trip), and useBookingIngestion picks
 * them up to populate the trip board.
 *
 * We send into the chat-store via useSendMessage. If there's no
 * active session we default to GENERAL_SESSION_ID so the message
 * always lands somewhere. Toasts cover the user-facing feedback —
 * the actual trip creation happens through the ingestion path.
 */

import { useCallback } from 'react';
import { getChatStore } from '@/features/app/bootstrap';
import { useSendMessage } from '@/features/chat/useSendMessage';
import { toast } from '@/features/toast';
import { GENERAL_SESSION_ID } from '@/types/chat-session';
import { useTravelStore } from './travel-store';
import { TRIP_DISCOVERY_PROMPT, BOOKING_CONTRACT_PROMPT } from './parser';

export function useScanForTrips(): {
  scan: () => void;
  scanInFlight: boolean;
} {
  const sendMessage = useSendMessage();
  const scanInFlight = useTravelStore((s) => s.scanInFlight);

  const scan = useCallback(() => {
    if (useTravelStore.getState().scanInFlight) return;

    /* Make sure something is selected so sendMessage has a target.
       Falling back to the general session keeps trip discovery
       separate from any trip-specific chat history. */
    try {
      const chat = getChatStore();
      const currentSessionId = chat.getState().activeSessionId;
      if (!currentSessionId) {
        chat.getState().setActiveSession(GENERAL_SESSION_ID);
      }
    } catch (err) {
      console.warn('[scan-for-trips] chat store unavailable', err);
      toast({
        title: 'Scan unavailable',
        description: 'Chat is not ready yet — give it a moment and try again.',
      });
      return;
    }

    useTravelStore.getState().setScanInFlight(true);
    toast({
      title: 'Scanning for trips…',
      description: 'Asking the assistant to look through your connections.',
      duration: 4000,
    });

    /* Reset the agent's context first so prior conversation state
       (acks, partial bookings, etc.) doesn't bleed into the scan. The
       OpenClaw chat backend treats /reset as a control command. */
    sendMessage('/reset');

    const prompt = [
      'I want you to discover new trips from my connected sources. Do not ask me for manual input — pull from Gmail, calendar, and any travel-site sessions you can reach.',
      '',
      TRIP_DISCOVERY_PROMPT,
      '',
      'After listing the trips, you may optionally include bookings for each one using this format:',
      '',
      BOOKING_CONTRACT_PROMPT,
    ].join('\n');

    sendMessage(prompt);

    /* Clear in-flight flag after a reasonable window — we don't know
       exactly when the agent finishes streaming, and the ingestion
       hook is what surfaces actual results. */
    setTimeout(() => {
      useTravelStore.getState().setScanInFlight(false);
    }, 12_000);
  }, [sendMessage]);

  return { scan, scanInFlight };
}
