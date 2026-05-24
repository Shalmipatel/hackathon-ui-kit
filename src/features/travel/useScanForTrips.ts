/**
 * Trigger a trip-discovery scan via the agent.
 *
 * Sends a one-line command — `wanderbot-sync deep` or
 * `wanderbot-sync shallow` — that triggers the openclaw skill
 * (see skills/wanderbot-sync.md). The skill scans Gmail (and
 * connected browser sources) and writes directly to RTDB under
 * /wanderbot/trips and /wanderbot/bookings. The frontend picks the
 * writes up on its next mount via loadAllTrips/Bookings.
 *
 * No schema, no rule list, no per-source guidance lives in chat
 * anymore — it's all baked into the skill on the openclaw side.
 */

import { useCallback } from 'react';
import { getChatStore } from '@/features/app/bootstrap';
import { useSendMessage } from '@/features/chat/useSendMessage';
import { toast } from '@/features/toast';
import { GENERAL_SESSION_ID } from '@/types/chat-session';
import { useTravelStore } from './travel-store';
import type { ScanDepth } from './parser';

export function useScanForTrips(): {
  scan: (depth?: ScanDepth) => void;
  scanInFlight: boolean;
} {
  const sendMessage = useSendMessage();
  const scanInFlight = useTravelStore((s) => s.scanInFlight);

  const scan = useCallback((depth: ScanDepth = 'shallow') => {
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

    /* Full sync = explicit rebuild. Wipe tombstones first so the
       agent can re-emit trips/bookings the user previously deleted
       without them being silently dropped by the ingestion gate. */
    if (depth === 'deep') {
      useTravelStore.getState().clearTombstones();
    }

    useTravelStore.getState().setScanInFlight(true);
    toast({
      title: depth === 'deep' ? 'Full sync started…' : 'Quick update started…',
      description:
        depth === 'deep'
          ? 'Sweeping the last 30 days across every connected source.'
          : 'Checking the last 7 days for new bookings.',
      duration: 4000,
    });

    sendMessage(`/wanderbot-sync ${depth}`);

    /* Clear in-flight flag after a reasonable window — we don't know
       exactly when the agent finishes streaming, and the ingestion
       hook is what surfaces actual results. */
    setTimeout(() => {
      useTravelStore.getState().setScanInFlight(false);
    }, 12_000);
  }, [sendMessage]);

  return { scan, scanInFlight };
}
