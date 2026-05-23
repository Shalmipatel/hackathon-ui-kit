/**
 * Firebase Realtime Database sync for trips and bookings.
 *
 * Why RTDB and not Firestore: simpler hackathon footprint — one
 * connection, schemaless writes, no composite indexes. Trips +
 * bookings are small and read entirely on app boot, so RTDB's
 * "fetch the world" pattern fits.
 *
 * Schema:
 *   /wanderbot/
 *     trips/<tripId>/      ← full Trip object
 *     bookings/<bookingId> ← full Booking object
 *
 * Auth: none for now. You need this in your RTDB rules to make the
 * hackathon flow work without users:
 *
 *   {
 *     "rules": {
 *       "wanderbot": {
 *         ".read": true,
 *         ".write": true
 *       }
 *     }
 *   }
 *
 * Required env vars:
 *   VITE_FIREBASE_API_KEY
 *   VITE_FIREBASE_DATABASE_URL  (e.g. https://<project>-default-rtdb.firebaseio.com)
 *   VITE_FIREBASE_PROJECT_ID
 *   VITE_FIREBASE_APP_ID
 *
 * When any of these are missing, every sync helper short-circuits to
 * a no-op so the app still runs offline — useful when developing
 * without Firebase credentials handy.
 */

import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getDatabase,
  ref,
  set,
  remove,
  get,
  onValue,
  off,
  type Database,
} from 'firebase/database';
import type { Booking, Trip } from './types';

const ROOT = 'wanderbot';
const TRIPS_PATH = `${ROOT}/trips`;
const BOOKINGS_PATH = `${ROOT}/bookings`;

interface FirebaseConfig {
  apiKey: string;
  databaseURL: string;
  projectId: string;
  appId: string;
  authDomain?: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

function readEnvConfig(): FirebaseConfig | null {
  const env = import.meta.env as Record<string, string | undefined>;
  const apiKey = env.VITE_FIREBASE_API_KEY;
  const databaseURL = env.VITE_FIREBASE_DATABASE_URL;
  const projectId = env.VITE_FIREBASE_PROJECT_ID;
  const appId = env.VITE_FIREBASE_APP_ID;
  if (!apiKey || !databaseURL || !projectId || !appId) return null;
  return {
    apiKey,
    databaseURL,
    projectId,
    appId,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  };
}

let app: FirebaseApp | null = null;
let db: Database | null = null;

function getDb(): Database | null {
  if (db) return db;
  const config = readEnvConfig();
  if (!config) return null;
  try {
    app = initializeApp(config);
    db = getDatabase(app);
    return db;
  } catch (err) {
    console.warn('[firebase] init failed', err);
    return null;
  }
}

export function isFirebaseConfigured(): boolean {
  return readEnvConfig() !== null;
}

/* ─────────────── Trips ─────────────── */

export async function loadAllTrips(): Promise<Trip[]> {
  const database = getDb();
  if (!database) return [];
  try {
    const snap = await get(ref(database, TRIPS_PATH));
    const value = snap.val() as Record<string, Trip> | null;
    if (!value) return [];
    return Object.values(value);
  } catch (err) {
    console.warn('[firebase] loadAllTrips failed', err);
    return [];
  }
}

export async function saveTripRemote(trip: Trip): Promise<void> {
  const database = getDb();
  if (!database) return;
  try {
    await set(ref(database, `${TRIPS_PATH}/${trip.id}`), stripUndefined(trip));
  } catch (err) {
    console.warn('[firebase] saveTrip failed', trip.id, err);
  }
}

export async function deleteTripRemote(tripId: string): Promise<void> {
  const database = getDb();
  if (!database) return;
  try {
    await remove(ref(database, `${TRIPS_PATH}/${tripId}`));
  } catch (err) {
    console.warn('[firebase] deleteTrip failed', tripId, err);
  }
}

/* ─────────────── Bookings ─────────────── */

export async function loadAllBookings(): Promise<Booking[]> {
  const database = getDb();
  if (!database) return [];
  try {
    const snap = await get(ref(database, BOOKINGS_PATH));
    const value = snap.val() as Record<string, Booking> | null;
    if (!value) return [];
    return Object.values(value);
  } catch (err) {
    console.warn('[firebase] loadAllBookings failed', err);
    return [];
  }
}

export async function saveBookingRemote(booking: Booking): Promise<void> {
  const database = getDb();
  if (!database) return;
  try {
    await set(ref(database, `${BOOKINGS_PATH}/${booking.id}`), stripUndefined(booking));
  } catch (err) {
    console.warn('[firebase] saveBooking failed', booking.id, err);
  }
}

export async function deleteBookingsForTripRemote(tripId: string): Promise<void> {
  const database = getDb();
  if (!database) return;
  try {
    const snap = await get(ref(database, BOOKINGS_PATH));
    const value = snap.val() as Record<string, Booking> | null;
    if (!value) return;
    const matching = Object.values(value).filter((b) => b.tripId === tripId);
    await Promise.all(
      matching.map((b) => remove(ref(database, `${BOOKINGS_PATH}/${b.id}`))),
    );
  } catch (err) {
    console.warn('[firebase] deleteBookingsForTrip failed', tripId, err);
  }
}

export async function deleteBookingRemote(bookingId: string): Promise<void> {
  const database = getDb();
  if (!database) return;
  try {
    await remove(ref(database, `${BOOKINGS_PATH}/${bookingId}`));
  } catch (err) {
    console.warn('[firebase] deleteBooking failed', bookingId, err);
  }
}

/* ─────────────── Realtime subscription (optional) ─────────────── */

export interface RemoteSnapshot {
  trips: Trip[];
  bookings: Booking[];
}

/** Subscribes to both trees. Calls back whenever either changes.
 *  Returns an unsubscribe function. */
export function subscribeToRemote(
  cb: (snapshot: RemoteSnapshot) => void,
): () => void {
  const database = getDb();
  if (!database) return () => undefined;

  let currentTrips: Trip[] = [];
  let currentBookings: Booking[] = [];
  let initialFlush = false;
  let tripsReady = false;
  let bookingsReady = false;

  const flush = () => {
    if (!initialFlush && !(tripsReady && bookingsReady)) return;
    initialFlush = true;
    cb({ trips: currentTrips, bookings: currentBookings });
  };

  const tripsRef = ref(database, TRIPS_PATH);
  const bookingsRef = ref(database, BOOKINGS_PATH);

  const tripsHandler = onValue(tripsRef, (snap) => {
    const value = snap.val() as Record<string, Trip> | null;
    currentTrips = value ? Object.values(value) : [];
    tripsReady = true;
    flush();
  });

  const bookingsHandler = onValue(bookingsRef, (snap) => {
    const value = snap.val() as Record<string, Booking> | null;
    currentBookings = value ? Object.values(value) : [];
    bookingsReady = true;
    flush();
  });

  return () => {
    off(tripsRef, 'value', tripsHandler);
    off(bookingsRef, 'value', bookingsHandler);
  };
}

/** RTDB rejects `undefined` values silently in some SDK paths and
 *  errors in others — strip them to keep writes predictable. */
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = stripUndefined(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}
