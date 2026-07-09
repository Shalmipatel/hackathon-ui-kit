// Firebase RTDB access over plain REST — no SDK. Same schema the iOS app and
// the web app read/write: wanderbot/trips/<id>, wanderbot/bookings/<id>.
//
// (When the locked-down security rules get deployed this will need a service
// token; today the rules are open so unauthenticated REST works.)

import type { Trip, Booking } from '../src/features/travel/types';
import type { View } from './view.js';

const DB =
  process.env.FIREBASE_DATABASE_URL ??
  'https://gen-lang-client-0500673478-default-rtdb.firebaseio.com';

async function rest(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${DB}/${path}.json`, init);
}

export async function loadTrips(): Promise<Trip[]> {
  const r = await rest('wanderbot/trips');
  if (!r.ok) return [];
  const map = (await r.json()) as Record<string, Trip> | null;
  return map ? Object.values(map).filter(Boolean) : [];
}

export async function loadBookings(): Promise<Booking[]> {
  const r = await rest('wanderbot/bookings');
  if (!r.ok) return [];
  const map = (await r.json()) as Record<string, Booking> | null;
  return map ? Object.values(map).filter(Boolean) : [];
}

export async function putTrip(trip: Trip): Promise<boolean> {
  const r = await rest(`wanderbot/trips/${trip.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(trip),
  });
  return r.ok;
}

export async function patchTrip(id: string, fields: Record<string, unknown>): Promise<boolean> {
  const r = await rest(`wanderbot/trips/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  return r.ok;
}

export async function deleteTrip(id: string): Promise<boolean> {
  const r = await rest(`wanderbot/trips/${id}`, { method: 'DELETE' });
  return r.ok;
}

export async function putBooking(b: Booking): Promise<boolean> {
  const r = await rest(`wanderbot/bookings/${b.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(b),
  });
  return r.ok;
}

export async function patchBooking(id: string, fields: Record<string, unknown>): Promise<boolean> {
  const r = await rest(`wanderbot/bookings/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  return r.ok;
}

export async function deleteBooking(id: string): Promise<boolean> {
  const r = await rest(`wanderbot/bookings/${id}`, { method: 'DELETE' });
  return r.ok;
}

// ---- Dynamic view specs (wanderbot/views/<id>) --------------------------

export async function putView(v: View): Promise<boolean> {
  const r = await rest(`wanderbot/views/${v.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(v),
  });
  return r.ok;
}

/** Read a view by id, with a path-injection guard and read-time TTL (RTDB
 *  has no native expiry). Returns null on bad id, miss, or expiry. */
export async function loadView(id: string): Promise<View | null> {
  if (!/^vw-[a-z0-9]{4,16}$/.test(id)) return null;
  const r = await rest(`wanderbot/views/${id}`);
  if (!r.ok) return null;
  const v = (await r.json()) as View | null;
  if (!v || (v.expiresAt && v.expiresAt < Date.now())) return null;
  return v;
}

/** Mark an item as added (idempotency marker) at views/<id>/added/<itemId>. */
export async function patchViewAdded(
  id: string,
  itemId: string,
  marker: { bookingId: string; at: number },
): Promise<boolean> {
  if (!/^vw-[a-z0-9]{4,16}$/.test(id)) return false;
  const key = itemId.replace(/[.#$/[\]]/g, '_');   // RTDB key-safe
  const r = await rest(`wanderbot/views/${id}/added/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(marker),
  });
  return r.ok;
}
