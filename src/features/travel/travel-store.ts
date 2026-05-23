import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Booking, ScanStatus, Trip } from './types';
import { MOCK_BOOKINGS, MOCK_TRIPS } from './mock-data';

/** Content fingerprint used to identify "same trip" across scans even
 *  when the agent regenerates ids. Shared with the ingestion path. */
function tripFingerprint(t: Pick<Trip, 'title' | 'startDate' | 'endDate'>): string {
  return `${t.title.trim().toLowerCase()}|${t.startDate}|${t.endDate}`;
}

/** One-shot pass that collapses any duplicate trips that snuck in
 *  before the dedup logic existed. Keeps the first trip per
 *  fingerprint and remaps the rest's bookings + chat sessions onto
 *  the survivor. Idempotent — running on a clean store changes
 *  nothing. */
function dedupeTrips(state: Pick<TravelState, 'trips' | 'bookings' | 'tripChatSessions' | 'activeTripId'>): {
  trips: Trip[];
  bookings: Booking[];
  tripChatSessions: Record<string, string>;
  activeTripId: string | null;
} {
  const survivors: Trip[] = [];
  const seenFp = new Map<string, string>(); // fingerprint → survivor id
  const remap = new Map<string, string>(); // dupe id → survivor id

  for (const trip of state.trips) {
    const fp = tripFingerprint(trip);
    const survivorId = seenFp.get(fp);
    if (survivorId) {
      remap.set(trip.id, survivorId);
    } else {
      seenFp.set(fp, trip.id);
      survivors.push(trip);
    }
  }

  if (remap.size === 0) {
    return {
      trips: state.trips,
      bookings: state.bookings,
      tripChatSessions: state.tripChatSessions,
      activeTripId: state.activeTripId,
    };
  }

  /* Repoint bookings of dropped trips at the survivor. */
  const bookings = state.bookings.map((b) =>
    remap.has(b.tripId) ? { ...b, tripId: remap.get(b.tripId)! } : b,
  );

  /* Chat sessions: prefer the survivor's; if only a dupe had one,
     migrate that id onto the survivor. */
  const tripChatSessions: Record<string, string> = {};
  for (const [tripId, sessionId] of Object.entries(state.tripChatSessions)) {
    const survivorId = remap.get(tripId) ?? tripId;
    if (!tripChatSessions[survivorId]) {
      tripChatSessions[survivorId] = sessionId;
    }
  }

  const activeTripId = state.activeTripId
    ? remap.get(state.activeTripId) ?? state.activeTripId
    : null;

  return { trips: survivors, bookings, tripChatSessions, activeTripId };
}

interface TravelState {
  trips: Trip[];
  bookings: Booking[];
  activeTripId: string | null;
  scan: ScanStatus | null;
  /** Maps a trip id to its dedicated chat-store session id. */
  tripChatSessions: Record<string, string>;
  /** True while a trip-discovery scan request is in flight. UI uses
   *  this to disable the scan button and show progress. */
  scanInFlight: boolean;

  setActiveTrip: (id: string | null) => void;
  addTrip: (trip: Trip) => void;
  updateTrip: (id: string, patch: Partial<Trip>) => void;
  deleteTrip: (id: string) => void;

  addBooking: (booking: Booking) => void;
  upsertBooking: (booking: Booking) => void;
  deleteBooking: (id: string) => void;

  setScan: (scan: ScanStatus | null) => void;

  setTripChatSession: (tripId: string, sessionId: string) => void;
  clearTripChatSession: (tripId: string) => void;

  setScanInFlight: (v: boolean) => void;

  /** Reset everything to the seed mocks — useful for the demo. */
  resetToMocks: () => void;
}

export const useTravelStore = create<TravelState>()(
  persist(
    (set) => ({
      trips: MOCK_TRIPS,
      bookings: MOCK_BOOKINGS,
      activeTripId: MOCK_TRIPS[0]?.id ?? null,
      scan: null,
      tripChatSessions: {},
      scanInFlight: false,

      setActiveTrip: (id) => set({ activeTripId: id }),
      addTrip: (trip) =>
        set((s) => {
          /* Hard guard against dupes — if a trip with the same
             fingerprint already exists, activate it instead of
             stacking another card. Cheap insurance against any caller
             that bypasses the ingestion-level dedupe. */
          const fp = tripFingerprint(trip);
          const dupe = s.trips.find((t) => tripFingerprint(t) === fp);
          if (dupe) {
            return { activeTripId: dupe.id };
          }
          return { trips: [...s.trips, trip], activeTripId: trip.id };
        }),
      updateTrip: (id, patch) =>
        set((s) => ({
          trips: s.trips.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        })),
      deleteTrip: (id) =>
        set((s) => {
          const { [id]: _removed, ...remainingChat } = s.tripChatSessions;
          return {
            trips: s.trips.filter((t) => t.id !== id),
            bookings: s.bookings.filter((b) => b.tripId !== id),
            activeTripId:
              s.activeTripId === id
                ? s.trips.find((t) => t.id !== id)?.id ?? null
                : s.activeTripId,
            tripChatSessions: remainingChat,
          };
        }),

      addBooking: (booking) =>
        set((s) => ({ bookings: [...s.bookings, booking] })),
      upsertBooking: (booking) =>
        set((s) => {
          const exists = s.bookings.some((b) => b.id === booking.id);
          return {
            bookings: exists
              ? s.bookings.map((b) => (b.id === booking.id ? booking : b))
              : [...s.bookings, booking],
          };
        }),
      deleteBooking: (id) =>
        set((s) => ({ bookings: s.bookings.filter((b) => b.id !== id) })),

      setScan: (scan) => set({ scan }),

      setTripChatSession: (tripId, sessionId) =>
        set((s) => ({
          tripChatSessions: { ...s.tripChatSessions, [tripId]: sessionId },
        })),
      clearTripChatSession: (tripId) =>
        set((s) => {
          const { [tripId]: _removed, ...rest } = s.tripChatSessions;
          return { tripChatSessions: rest };
        }),

      setScanInFlight: (v) => set({ scanInFlight: v }),

      resetToMocks: () =>
        set({
          trips: MOCK_TRIPS,
          bookings: MOCK_BOOKINGS,
          activeTripId: MOCK_TRIPS[0]?.id ?? null,
          scan: null,
          tripChatSessions: {},
        }),
    }),
    {
      name: 'travel-store-v1',
      partialize: (state) => ({
        trips: state.trips,
        bookings: state.bookings,
        activeTripId: state.activeTripId,
        tripChatSessions: state.tripChatSessions,
      }),
      /* Run the dedupe pass once per app start so dupes that landed
         before the ingestion-level fix get collapsed automatically. */
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const cleaned = dedupeTrips({
          trips: state.trips,
          bookings: state.bookings,
          tripChatSessions: state.tripChatSessions,
          activeTripId: state.activeTripId,
        });
        const dropped = state.trips.length - cleaned.trips.length;
        if (dropped > 0) {
          console.warn(`[travel-store] dedup pass dropped ${dropped} duplicate trip(s) on rehydrate.`);
          state.trips = cleaned.trips;
          state.bookings = cleaned.bookings;
          state.tripChatSessions = cleaned.tripChatSessions;
          state.activeTripId = cleaned.activeTripId;
        }
      },
    },
  ),
);

/** Selectors */

export function selectActiveTrip(state: TravelState): Trip | null {
  if (!state.activeTripId) return null;
  return state.trips.find((t) => t.id === state.activeTripId) ?? null;
}

export function selectBookingsForTrip(
  state: TravelState,
  tripId: string | null,
): Booking[] {
  if (!tripId) return [];
  return state.bookings
    .filter((b) => b.tripId === tripId)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}
