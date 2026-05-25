/**
 * Bidirectional sync between the local travel store and Firebase RTDB.
 *
 *   INBOUND  (RTDB → local): subscribeToRemote opens an onValue listener
 *      on /wanderbot/trips and /wanderbot/bookings. Every snapshot:
 *      drop tombstoned ids, add/update items that differ from local,
 *      and drop local items that are missing from remote (without
 *      recording a tombstone on this tab — the delete originated
 *      somewhere else).
 *
 *   OUTBOUND (local → RTDB): a Zustand subscriber diffs the previous
 *      snapshot against the new one and PUTs / DELETEs the changed
 *      records.
 *
 * No infinite loops despite the bidirectional flow: when an inbound
 * snapshot lands, the local change it triggers is content-identical
 * to what RTDB already holds, so the outbound mirror's `shallowEqual`
 * check short-circuits the write. Even if a redundant PUT slips
 * through, RTDB writes with identical bodies don't re-fire onValue.
 *
 * No auth yet — the hackathon flow assumes open RTDB rules on
 * /wanderbot. Add real auth before going to prod.
 */

import { useEffect, useRef } from 'react';
import {
  deleteBookingRemote,
  deleteTripRemote,
  isFirebaseConfigured,
  saveBookingRemote,
  saveTripRemote,
  subscribeToRemote,
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
    let prevTrips = useTravelStore.getState().trips;
    let prevBookings = useTravelStore.getState().bookings;

    /* Outbound mirror — push local changes to RTDB. Capture the
       pre-subscription baseline so the FIRST snapshot from RTDB
       (which sets local state) doesn't trigger an immediate
       round-trip write. */
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

    /* Inbound subscription — reconcile local to match remote on every
       RTDB change. */
    const unsubFromRemote = subscribeToRemote(({ trips: remoteTrips, bookings: remoteBookings }) => {
      if (cancelled) return;
      reconcileFromRemote(remoteTrips, remoteBookings);
    });

    return () => {
      cancelled = true;
      if (unsubFromStore) unsubFromStore();
      unsubFromRemote();
    };
  }, []);
}

/** Apply a remote snapshot to local: clean tombstoned RTDB rows,
 *  upsert new / changed remote items, drop local items missing from
 *  remote. Reads + writes the live store. */
/** Migrate a legacy booking record into the dayKey + position shape.
 *  Idempotent — already-migrated records pass through untouched.
 *
 *  Legacy shape:
 *    { start: '2026-06-20T07:52:00', hasTime: false, ... }
 *  Migrated shape:
 *    { dayKey: '2026-06-20', position: ~appended, ... } (no `start`)
 *
 *  For legacy items with `hasTime: false` we drop the fake `start`
 *  entirely (the agent skill used to invent noon-ish timestamps so
 *  the item would sort somewhere). For timed legacy items we keep
 *  `start` and derive both `dayKey` and `position` from it. */
function migrateBooking(raw: unknown): Booking | null {
  if (!raw || typeof raw !== 'object') return raw as Booking;
  const b = raw as Record<string, unknown> & { hasTime?: unknown };
  const hasDayKey = typeof b.dayKey === 'string';
  const hasPosition = typeof b.position === 'number';
  if (hasDayKey && hasPosition) {
    /* Already migrated. Strip legacy `hasTime` field if it lingered. */
    if ('hasTime' in b) {
      const { hasTime: _drop, ...rest } = b;
      return rest as unknown as Booking;
    }
    return b as unknown as Booking;
  }
  const startStr = typeof b.start === 'string' ? (b.start as string) : '';
  const dayKey = hasDayKey
    ? (b.dayKey as string)
    : startStr.slice(0, 10);
  const isUntimedLegacy = b.hasTime === false;
  const position = hasPosition
    ? (b.position as number)
    : computeInitialPosition(startStr, isUntimedLegacy);
  const { hasTime: _drop, ...rest } = b;
  const next: Record<string, unknown> = { ...rest, dayKey, position };
  if (isUntimedLegacy) {
    /* Drop the placeholder timestamp so the UI shows no time. */
    delete next.start;
  }
  return next as unknown as Booking;
}

/** Wall-clock seconds since midnight for a timestamp string. Used
 *  as the initial `position` for timed legacy items so they keep
 *  their chronological order through migration. Untimed items get a
 *  large-ish default that sorts them to the bottom of their day. */
function computeInitialPosition(
  startStr: string,
  isUntimed: boolean,
): number {
  if (isUntimed) {
    /* Default sort-to-end. Drag-reorder picks midpoints; this is
       just the first-render fallback. */
    return 86400;
  }
  const m = startStr.match(/T(\d{2}):(\d{2})/);
  if (!m) return 0;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  return hh * 3600 + mm * 60;
}

function reconcileFromRemote(
  remoteTrips: Trip[],
  remoteBookings: Booking[],
): void {
  /* Run legacy records through the migration upfront so the rest of
     the reconciler (and the local store) only sees the new shape. */
  const migratedBookings = remoteBookings
    .map((b) => migrateBooking(b))
    .filter((b): b is Booking => b !== null);
  remoteBookings = migratedBookings;
  const state = useTravelStore.getState();

  /* Tombstone gate — never let a tombstoned trip/booking sneak back
     in via the snapshot. Fire an async delete to clean it from RTDB
     for the next tab that hydrates. */
  const deletedTripIds = new Set(state.deletedTripIds);
  const deletedFps = new Set(state.deletedTripFingerprints);
  const isTombstonedTrip = (t: Trip) =>
    deletedTripIds.has(t.id) || deletedFps.has(tripFingerprint(t));
  const zombieTrips = remoteTrips.filter(isTombstonedTrip);
  if (zombieTrips.length > 0) {
    console.warn(
      `[firebase-sync] cleaning ${zombieTrips.length} zombie trip(s) from RTDB.`,
    );
    void Promise.all(zombieTrips.map((t) => deleteTripRemote(t.id)));
  }
  const liveRemoteTrips = remoteTrips.filter((t) => !isTombstonedTrip(t));

  const deletedBookingIds = new Set(state.deletedBookingIds);
  const zombieBookings = remoteBookings.filter((b) => deletedBookingIds.has(b.id));
  if (zombieBookings.length > 0) {
    console.warn(
      `[firebase-sync] cleaning ${zombieBookings.length} zombie booking(s) from RTDB.`,
    );
    void Promise.all(zombieBookings.map((b) => deleteBookingRemote(b.id)));
  }
  const liveRemoteBookings = remoteBookings.filter((b) => !deletedBookingIds.has(b.id));

  /* Upsert remote → local. Skip items that are content-identical to
     what local already has so the outbound mirror has nothing to fire. */
  const localTripById = new Map(state.trips.map((t) => [t.id, t]));
  for (const t of liveRemoteTrips) {
    const local = localTripById.get(t.id);
    if (!local) {
      state.addTrip(t);
    } else if (!shallowEqualTrip(local, t)) {
      state.updateTrip(t.id, t);
    }
  }
  const localBookingById = new Map(state.bookings.map((b) => [b.id, b]));
  for (const b of liveRemoteBookings) {
    const local = localBookingById.get(b.id);
    if (!local || !shallowEqualBooking(local, b)) {
      state.upsertBooking(b);
    }
  }

  /* Drop local items missing from remote. These were deleted on
     another tab/device. Use raw setState so we don't add a tombstone
     — the delete didn't originate here. */
  const remoteTripIds = new Set(liveRemoteTrips.map((t) => t.id));
  const remoteBookingIds = new Set(liveRemoteBookings.map((b) => b.id));
  const localOnlyTrips = state.trips.filter((t) => !remoteTripIds.has(t.id));
  const localOnlyBookings = state.bookings.filter(
    (b) => !remoteBookingIds.has(b.id),
  );
  if (localOnlyTrips.length > 0 || localOnlyBookings.length > 0) {
    useTravelStore.setState((s) => ({
      trips: localOnlyTrips.length > 0
        ? s.trips.filter((t) => remoteTripIds.has(t.id))
        : s.trips,
      bookings: localOnlyBookings.length > 0
        ? s.bookings.filter((b) => remoteBookingIds.has(b.id))
        : s.bookings,
      /* If we just yanked the active trip out from under the user,
         clear the selection so the UI doesn't dangle. */
      activeTripId: localOnlyTrips.some((t) => t.id === s.activeTripId)
        ? null
        : s.activeTripId,
    }));
  }
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
