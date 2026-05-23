/**
 * Mirrors the local travel store to Firebase RTDB.
 *
 * Pattern:
 *   1. On mount, fetch all trips + bookings from RTDB. Anything we
 *      already have locally but that's missing remotely gets pushed
 *      up (handles the first-run case where the user already has
 *      trips in localStorage from before Firebase was wired). Then
 *      we overlay the remote state on top of what's local so any
 *      trips/bookings created on a different device show up.
 *   2. After hydration, subscribe to the local store and mirror
 *      any subsequent change (add / update / delete on trips and
 *      bookings) to RTDB. Diff against the previous snapshot to
 *      figure out what actually changed — keeps writes minimal.
 *
 * No auth yet — the hackathon flow assumes open RTDB rules on
 * /wanderbot. Add real auth before going to prod.
 */

import { useEffect, useRef } from 'react';
import {
  deleteBookingRemote,
  deleteTripRemote,
  isFirebaseConfigured,
  loadAllBookings,
  loadAllTrips,
  saveBookingRemote,
  saveTripRemote,
} from './firebase';
import { tripFingerprint, useTravelStore } from './travel-store';
import type { Booking, Trip } from './types';

export function useFirebaseSync(): void {
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    let cancelled = false;
    let unsubFromStore: (() => void) | null = null;

    (async () => {
      try {
        const [remoteTrips, remoteBookings] = await Promise.all([
          loadAllTrips(),
          loadAllBookings(),
        ]);
        if (cancelled) return;

        const state = useTravelStore.getState();
        const localTripIds = new Set(state.trips.map((t) => t.id));
        const localBookingIds = new Set(state.bookings.map((b) => b.id));
        const remoteTripIds = new Set(remoteTrips.map((t) => t.id));
        const remoteBookingIds = new Set(remoteBookings.map((b) => b.id));

        /* Tombstone gate — never hydrate a trip the user previously
           deleted. RTDB might still have the row if the remote delete
           is in flight or failed silently last time around. While
           we're at it, fire a cleanup delete to RTDB so the row
           doesn't keep coming back on every reload. */
        const deletedIds = new Set(state.deletedTripIds);
        const deletedFps = new Set(state.deletedTripFingerprints);
        const isTombstoned = (t: typeof remoteTrips[number]) =>
          deletedIds.has(t.id) || deletedFps.has(tripFingerprint(t));

        const tombstonedRemoteTrips = remoteTrips.filter(isTombstoned);
        if (tombstonedRemoteTrips.length > 0) {
          console.warn(
            `[firebase-sync] cleaning ${tombstonedRemoteTrips.length} zombie trip(s) from RTDB.`,
          );
          await Promise.all(
            tombstonedRemoteTrips.map((t) => deleteTripRemote(t.id)),
          );
        }
        const liveRemoteTrips = remoteTrips.filter((t) => !isTombstoned(t));

        /* Push local-only items up. */
        await Promise.all([
          ...state.trips
            .filter((t) => !remoteTripIds.has(t.id))
            .map((t) => saveTripRemote(t)),
          ...state.bookings
            .filter((b) => !remoteBookingIds.has(b.id))
            .map((b) => saveBookingRemote(b)),
        ]);

        /* Merge remote-only items into the store. addTrip's tombstone
           check is the last line of defence — even if liveRemoteTrips
           somehow leaked through, addTrip itself would refuse the
           insert with a console warning. */
        const tripsToAdd = liveRemoteTrips.filter((t) => !localTripIds.has(t.id));
        const bookingsToAdd = remoteBookings.filter(
          (b) => !localBookingIds.has(b.id),
        );
        if (tripsToAdd.length > 0 || bookingsToAdd.length > 0) {
          const store = useTravelStore.getState();
          for (const t of tripsToAdd) store.addTrip(t);
          for (const b of bookingsToAdd) store.upsertBooking(b);
        }
      } catch (err) {
        console.warn('[firebase-sync] initial hydrate failed', err);
      }

      if (cancelled) return;

      /* Diff-and-mirror subscriber. Captures the *post-hydrate* state
         as the baseline so the initial push above doesn't get re-fired. */
      let prevTrips = useTravelStore.getState().trips;
      let prevBookings = useTravelStore.getState().bookings;

      unsubFromStore = useTravelStore.subscribe((state) => {
        const trips = state.trips;
        const bookings = state.bookings;

        if (trips !== prevTrips) {
          mirrorTripChanges(prevTrips, trips);
          prevTrips = trips;
        }
        if (bookings !== prevBookings) {
          mirrorBookingChanges(prevBookings, bookings);
          prevBookings = bookings;
        }
      });
    })();

    return () => {
      cancelled = true;
      if (unsubFromStore) unsubFromStore();
    };
  }, []);
}

function mirrorTripChanges(prev: Trip[], curr: Trip[]): void {
  const prevById = new Map(prev.map((t) => [t.id, t]));
  const currById = new Map(curr.map((t) => [t.id, t]));

  for (const trip of curr) {
    const before = prevById.get(trip.id);
    if (!before || !shallowEqualTrip(before, trip)) {
      void saveTripRemote(trip);
    }
  }
  for (const before of prev) {
    if (!currById.has(before.id)) {
      void deleteTripRemote(before.id);
    }
  }
}

function mirrorBookingChanges(prev: Booking[], curr: Booking[]): void {
  const prevById = new Map(prev.map((b) => [b.id, b]));
  const currById = new Map(curr.map((b) => [b.id, b]));

  for (const booking of curr) {
    const before = prevById.get(booking.id);
    if (!before || !shallowEqualBooking(before, booking)) {
      void saveBookingRemote(booking);
    }
  }
  for (const before of prev) {
    if (!currById.has(before.id)) {
      void deleteBookingRemote(before.id);
    }
  }
}

/* Cheap structural compare — JSON.stringify is fine for these
   smallish, plain-object shapes and dodges the deep-equality boilerplate. */
function shallowEqualTrip(a: Trip, b: Trip): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
function shallowEqualBooking(a: Booking, b: Booking): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
