import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Booking, ScanStatus, Trip } from './types';
import { MOCK_BOOKINGS, MOCK_TRIPS } from './mock-data';

interface TravelState {
  trips: Trip[];
  bookings: Booking[];
  activeTripId: string | null;
  scan: ScanStatus | null;
  /** Maps a trip id to its dedicated chat-store session id. */
  tripChatSessions: Record<string, string>;
  /** UI state — whether the New Trip modal is open. Lives in this
   *  store rather than a separate UI store because the trigger is
   *  inside the sidebar's TripList but the modal mounts at the
   *  TripsView level. */
  newTripModalOpen: boolean;

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

  openNewTripModal: () => void;
  closeNewTripModal: () => void;

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
      newTripModalOpen: false,

      setActiveTrip: (id) => set({ activeTripId: id }),
      addTrip: (trip) =>
        set((s) => ({ trips: [...s.trips, trip], activeTripId: trip.id })),
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

      openNewTripModal: () => set({ newTripModalOpen: true }),
      closeNewTripModal: () => set({ newTripModalOpen: false }),

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
