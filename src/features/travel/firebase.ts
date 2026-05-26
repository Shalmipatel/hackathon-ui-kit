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
const CHAT_SESSIONS_PATH = `${ROOT}/chat_sessions`;
const AUTH_REQUESTS_PATH = `${ROOT}/auth_requests`;
const GMAIL_CONNECTION_PATH = `${ROOT}/connections/gmail`;

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

/** Shared FirebaseApp accessor — the auth module needs the same
 *  initialised app instance to attach Auth to. Idempotent. */
export function getFirebaseApp(): FirebaseApp | null {
  if (app) return app;
  /* Side-effect of getDb: it calls initializeApp and caches `app`. */
  getDb();
  return app;
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

/* ─────────────── Chat sessions (cross-device mirror) ─────────────── */

/** A chat message as we mirror it to RTDB. Subset of the local
 *  ChatMessage shape — we strip fields that don't survive a JSON
 *  round-trip (audioDataUrl can be huge; isStreaming is ephemeral). */
export interface MirroredChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isHidden?: boolean;
}

/** PUT one message under /wanderbot/chat_sessions/<tripId>/<messageId>.
 *  Idempotent — safe to call on backfill and on every live update. */
export async function mirrorChatMessageRemote(
  tripId: string,
  message: MirroredChatMessage,
): Promise<void> {
  const database = getDb();
  if (!database) return;
  try {
    await set(
      ref(database, `${CHAT_SESSIONS_PATH}/${tripId}/${message.id}`),
      stripUndefined(message as unknown as Record<string, unknown>),
    );
  } catch (err) {
    console.warn('[firebase] mirrorChatMessage failed', tripId, message.id, err);
  }
}

/** Drop a trip's entire mirrored chat tree. Used when the user starts
 *  a fresh session via the "New" button. */
export async function clearChatSessionRemote(tripId: string): Promise<void> {
  const database = getDb();
  if (!database) return;
  try {
    await remove(ref(database, `${CHAT_SESSIONS_PATH}/${tripId}`));
  } catch (err) {
    console.warn('[firebase] clearChatSession failed', tripId, err);
  }
}

/* ─────────────── gog auth requests ─────────────── */

export interface AuthRequest {
  id: string;
  email: string;
  code: string;
  state: string;
  authUrl: string;
  redirectUri: string;
  services: string;
  /** "pending" when waiting on the agent; "success" / "error" after
   *  it processes. Agent writes status + result back to the same
   *  path; the UI listens via subscribeToAuthRequest. */
  status: 'pending' | 'success' | 'error';
  createdAt: number;
  completedAt?: number;
  stdout?: string;
  stderr?: string;
  message?: string;
}

export async function writeAuthRequest(req: AuthRequest): Promise<void> {
  const database = getDb();
  if (!database) {
    console.warn('[firebase] writeAuthRequest skipped — Firebase not configured.');
    return;
  }
  try {
    await set(ref(database, `${AUTH_REQUESTS_PATH}/${req.id}`), stripUndefined(req));
  } catch (err) {
    console.warn('[firebase] writeAuthRequest failed', req.id, err);
  }
}

export function subscribeToAuthRequest(
  id: string,
  cb: (req: AuthRequest | null) => void,
): () => void {
  const database = getDb();
  if (!database) return () => undefined;
  const path = ref(database, `${AUTH_REQUESTS_PATH}/${id}`);
  const handler = onValue(path, (snap) => {
    cb(snap.val() as AuthRequest | null);
  });
  return () => off(path, 'value', handler);
}

/* ─────────────── gmail connection (cross-device) ─────────────── */

export interface GmailConnection {
  email: string;
  connectedAt: number;
}

export async function writeGmailConnection(email: string): Promise<void> {
  const database = getDb();
  if (!database) return;
  try {
    await set(ref(database, GMAIL_CONNECTION_PATH), { email, connectedAt: Date.now() });
  } catch (err) {
    console.warn('[firebase] writeGmailConnection failed', err);
  }
}

export async function clearGmailConnection(): Promise<void> {
  const database = getDb();
  if (!database) return;
  try {
    await remove(ref(database, GMAIL_CONNECTION_PATH));
  } catch (err) {
    console.warn('[firebase] clearGmailConnection failed', err);
  }
}

export function subscribeToGmailConnection(
  cb: (conn: GmailConnection | null) => void,
): () => void {
  const database = getDb();
  if (!database) return () => undefined;
  const path = ref(database, GMAIL_CONNECTION_PATH);
  const handler = onValue(path, (snap) => {
    cb(snap.val() as GmailConnection | null);
  });
  return () => off(path, 'value', handler);
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
