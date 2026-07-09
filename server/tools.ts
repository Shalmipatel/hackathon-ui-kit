// Trip CRUD tools for the iMessage agent — the TS server-side twin of the
// iOS TripAgentTools. Reads live state from RTDB and writes back in the same
// schema the apps read. Returns short, model-friendly strings.

import type { Trip, Booking, BookingType, Place } from '../src/features/travel/types';
import * as db from './rtdb.js';

const PALETTE = ['#FEEB29', '#F39C6B', '#7CC4A0', '#8FB7E8', '#C7A8E8'];
const TYPES: BookingType[] = [
  'flight', 'hotel', 'attraction', 'experience', 'event', 'activity', 'restaurant', 'transport',
];

function isoDay(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** yyyy-MM-dd list spanning start..end inclusive. */
function dayKeys(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  const s = new Date(startDate + 'T00:00:00Z');
  const e = new Date(endDate + 'T00:00:00Z');
  for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function hhmm(iso?: string): string {
  if (!iso) return '';
  const m = /T(\d{2}:\d{2})/.exec(iso);
  return m ? m[1] : '';
}

function place(a: Record<string, unknown>, nameK: string, latK: string, lngK: string): Place | undefined {
  const name = a[nameK];
  const lat = a[latK];
  const lng = a[lngK];
  if (typeof name === 'string' && typeof lat === 'number' && typeof lng === 'number') {
    return { name, lat, lng, address: typeof a['place_address'] === 'string' ? (a['place_address'] as string) : undefined };
  }
  return undefined;
}

// ---- Tool schemas (flat/Responses format) ----
const str = (d: string) => ({ type: 'string', description: d });
const num = (d: string) => ({ type: 'number', description: d });

export const toolSchemas = [
  { type: 'function', name: 'get_trips', description: "List all of the traveler's trips with ids, destinations, and dates.", parameters: { type: 'object', properties: {}, required: [] } },
  { type: 'function', name: 'get_itinerary', description: "Get the full day-by-day itinerary for a trip, including every booking's id, type, title, times, and place.", parameters: { type: 'object', properties: { trip_id: str('The trip id') }, required: ['trip_id'] } },
  { type: 'function', name: 'create_trip', description: 'Create a new trip.', parameters: { type: 'object', properties: { title: str('Short title'), destination: str('City/region + country'), start_date: str('YYYY-MM-DD'), end_date: str('YYYY-MM-DD'), summary: str('Optional one-line summary') }, required: ['title', 'destination', 'start_date', 'end_date'] } },
  { type: 'function', name: 'update_trip', description: 'Update fields on a trip. Only pass fields to change.', parameters: { type: 'object', properties: { trip_id: str('The trip id'), title: str('New title'), destination: str('New destination'), start_date: str('YYYY-MM-DD'), end_date: str('YYYY-MM-DD'), summary: str('New summary') }, required: ['trip_id'] } },
  { type: 'function', name: 'delete_trip', description: 'Delete a trip and all its bookings. Irreversible — confirm first.', parameters: { type: 'object', properties: { trip_id: str('The trip id') }, required: ['trip_id'] } },
  { type: 'function', name: 'add_booking', description: 'Add an itinerary item (hotel/flight/restaurant/attraction/activity/experience/event/transport).', parameters: { type: 'object', properties: { trip_id: str('The trip id'), type: { type: 'string', enum: TYPES }, title: str('Display title'), day: str('YYYY-MM-DD'), start_time: str('24h HH:MM'), end_time: str('24h HH:MM'), end_day: str('YYYY-MM-DD for multi-day items'), place_name: str('Venue name'), place_lat: num('Latitude'), place_lng: num('Longitude'), notes: str('Notes'), provider: str('Provider/operator'), link: str('URL'), nights: num('Hotel nights') }, required: ['trip_id', 'type', 'title', 'day'] } },
  { type: 'function', name: 'update_booking', description: 'Update fields on an itinerary item.', parameters: { type: 'object', properties: { booking_id: str('The booking id'), title: str('New title'), day: str('YYYY-MM-DD'), start_time: str('24h HH:MM'), notes: str('Notes'), link: str('URL') }, required: ['booking_id'] } },
  { type: 'function', name: 'delete_booking', description: 'Remove an itinerary item.', parameters: { type: 'object', properties: { booking_id: str('The booking id') }, required: ['booking_id'] } },
];

// ---- What a tool round can surface for a card (single subject) ----
export interface Subject {
  kind: 'trip' | 'booking';
  trip?: Trip;
  booking?: Booking;
}

export class Tools {
  trips: Trip[] = [];
  bookings: Booking[] = [];
  /** Trips/bookings the agent read or touched — used to pick a card subject. */
  touched: Subject[] = [];

  async load() {
    [this.trips, this.bookings] = await Promise.all([db.loadTrips(), db.loadBookings()]);
  }

  private tripById(id: string) { return this.trips.find((t) => t.id === id); }

  async execute(name: string, args: Record<string, unknown>): Promise<string> {
    switch (name) {
      case 'get_trips': return this.getTrips();
      case 'get_itinerary': return this.getItinerary(args);
      case 'create_trip': return this.createTrip(args);
      case 'update_trip': return this.updateTrip(args);
      case 'delete_trip': return this.deleteTrip(args);
      case 'add_booking': return this.addBooking(args);
      case 'update_booking': return this.updateBooking(args);
      case 'delete_booking': return this.deleteBooking(args);
      default: return `Unknown tool: ${name}`;
    }
  }

  private getTrips(): string {
    if (!this.trips.length) return 'No trips yet.';
    // Tag each trip PAST / ONGOING / UPCOMING against today, and sort
    // chronologically, so the model never has to compute "which is next" —
    // it just reads the first UPCOMING/ONGOING one. (YYYY-MM-DD strings
    // compare lexicographically = chronologically.)
    const today = new Date().toISOString().slice(0, 10);
    return [...this.trips]
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .map((t) => {
        const status = t.endDate < today ? 'PAST' : t.startDate > today ? 'UPCOMING' : 'ONGOING';
        return `${t.id}: "${t.title}" — ${t.destination} (${t.startDate} → ${t.endDate}) [${status}]`;
      })
      .join('\n');
  }

  private getItinerary(a: Record<string, unknown>): string {
    const trip = typeof a.trip_id === 'string' ? this.tripById(a.trip_id) : undefined;
    if (!trip) return `Trip not found. Known trips:\n${this.getTrips()}`;
    this.touched.push({ kind: 'trip', trip });
    const byDay = new Map<string, Booking[]>();
    for (const b of this.bookings.filter((b) => b.tripId === trip.id)) {
      (byDay.get(b.dayKey) ?? byDay.set(b.dayKey, []).get(b.dayKey)!).push(b);
    }
    const out = [`${trip.id}: "${trip.title}" — ${trip.destination} (${trip.startDate} → ${trip.endDate})`];
    if (trip.summary) out.push(`Summary: ${trip.summary}`);
    for (const key of dayKeys(trip.startDate, trip.endDate)) {
      out.push(`${key}:`);
      const items = (byDay.get(key) ?? []).sort((x, y) => x.position - y.position);
      if (!items.length) out.push('  (nothing planned)');
      for (const b of items) {
        let line = `  [${b.id}] ${b.type}: ${b.title}`;
        const t = hhmm(b.start);
        if (t) line += ` ${t}`;
        const p = (b as { place?: Place }).place ?? (b as { to?: Place }).to;
        if (p?.name) line += ` @ ${p.name}`;
        out.push(line);
      }
    }
    return out.join('\n');
  }

  private async createTrip(a: Record<string, unknown>): Promise<string> {
    const { title, destination, start_date: s, end_date: e } = a as Record<string, string>;
    if (!title || !destination || !isoDay(s) || !isoDay(e)) {
      return 'Missing/invalid fields — need title, destination, start_date, end_date (YYYY-MM-DD).';
    }
    const slug = destination.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').slice(0, 2).join('-');
    const id = `trip-${slug}-${Math.random().toString(16).slice(2, 6)}`;
    const trip: Trip = {
      id, title, destination, startDate: s, endDate: e,
      color: PALETTE[this.trips.length % PALETTE.length],
      summary: typeof a.summary === 'string' ? a.summary : undefined,
    };
    const ok = await db.putTrip(trip);
    if (ok) { this.trips.push(trip); this.touched.push({ kind: 'trip', trip }); }
    return ok ? `Created trip ${id} ("${title}", ${s} → ${e}).` : 'Create failed to sync.';
  }

  private async updateTrip(a: Record<string, unknown>): Promise<string> {
    const trip = typeof a.trip_id === 'string' ? this.tripById(a.trip_id) : undefined;
    if (!trip) return `Trip not found. Known trips:\n${this.getTrips()}`;
    const patch: Record<string, unknown> = {};
    if (typeof a.title === 'string') patch.title = a.title;
    if (typeof a.destination === 'string') patch.destination = a.destination;
    if (isoDay(a.start_date)) patch.startDate = a.start_date;
    if (isoDay(a.end_date)) patch.endDate = a.end_date;
    if (typeof a.summary === 'string') patch.summary = a.summary;
    if (!Object.keys(patch).length) return 'Nothing to update.';
    const ok = await db.patchTrip(trip.id, patch);
    if (ok) { Object.assign(trip, patch); this.touched.push({ kind: 'trip', trip }); }
    return ok ? `Updated trip ${trip.id}: ${Object.keys(patch).join(', ')}.` : 'Update failed to sync.';
  }

  private async deleteTrip(a: Record<string, unknown>): Promise<string> {
    const trip = typeof a.trip_id === 'string' ? this.tripById(a.trip_id) : undefined;
    if (!trip) return `Trip not found. Known trips:\n${this.getTrips()}`;
    const ids = this.bookings.filter((b) => b.tripId === trip.id).map((b) => b.id);
    for (const id of ids) await db.deleteBooking(id);
    const ok = await db.deleteTrip(trip.id);
    if (ok) {
      this.trips = this.trips.filter((t) => t.id !== trip.id);
      this.bookings = this.bookings.filter((b) => b.tripId !== trip.id);
    }
    return ok ? `Deleted trip ${trip.id} and ${ids.length} booking(s).` : 'Delete failed to sync.';
  }

  private async addBooking(a: Record<string, unknown>): Promise<string> {
    const trip = typeof a.trip_id === 'string' ? this.tripById(a.trip_id) : undefined;
    if (!trip) return `Trip not found. Known trips:\n${this.getTrips()}`;
    const type = a.type as BookingType;
    if (!TYPES.includes(type)) return `Invalid type — use one of: ${TYPES.join(', ')}.`;
    const title = a.title as string;
    const day = a.day as string;
    if (!title || !isoDay(day)) return 'Missing title or day (YYYY-MM-DD).';

    const id = `bk-${Math.random().toString(16).slice(2, 10)}`;
    const startTime = typeof a.start_time === 'string' ? a.start_time : undefined;
    const endTime = typeof a.end_time === 'string' ? a.end_time : undefined;
    const endDay = isoDay(a.end_day) ? (a.end_day as string) : day;
    const start = startTime ? `${day}T${startTime}:00` : undefined;
    const end = endTime ? `${endDay}T${endTime}:00` : undefined;
    const [hh, mm] = (startTime ?? '').split(':').map(Number);
    const position = startTime ? hh * 3600 + mm * 60 : 86400;

    const p = place(a, 'place_name', 'place_lat', 'place_lng');
    const booking = {
      id, tripId: trip.id, type, title, dayKey: day, position, source: 'agent',
      ...(start ? { start } : {}),
      ...(end ? { end } : {}),
      ...(typeof a.notes === 'string' ? { notes: a.notes } : {}),
      ...(typeof a.provider === 'string' ? { provider: a.provider } : {}),
      ...(typeof a.link === 'string' ? { link: a.link } : {}),
      ...(typeof a.nights === 'number' ? { nights: a.nights } : {}),
      ...(p ? (type === 'flight' || type === 'transport' ? { to: p } : { place: p }) : {}),
    } as unknown as Booking;

    const ok = await db.putBooking(booking);
    if (ok) { this.bookings.push(booking); this.touched.push({ kind: 'booking', booking, trip }); }
    return ok
      ? `Added ${type} "${title}" on ${day}${startTime ? ` at ${startTime}` : ''} (booking id ${id}).`
      : 'Add failed to sync.';
  }

  private async updateBooking(a: Record<string, unknown>): Promise<string> {
    const b = typeof a.booking_id === 'string' ? this.bookings.find((x) => x.id === a.booking_id) : undefined;
    if (!b) return 'Booking not found — call get_itinerary for current ids.';
    const patch: Record<string, unknown> = {};
    if (typeof a.title === 'string') patch.title = a.title;
    if (typeof a.notes === 'string') patch.notes = a.notes;
    if (typeof a.link === 'string') patch.link = a.link;
    if (isoDay(a.day)) patch.dayKey = a.day;
    if (typeof a.start_time === 'string' && isoDay(patch.dayKey ?? b.dayKey)) {
      const day = (patch.dayKey ?? b.dayKey) as string;
      patch.start = `${day}T${a.start_time}:00`;
    }
    if (!Object.keys(patch).length) return 'Nothing to update.';
    const ok = await db.patchBooking(b.id, patch);
    if (ok) { Object.assign(b, patch); this.touched.push({ kind: 'booking', booking: b, trip: this.tripById(b.tripId) }); }
    return ok ? `Updated ${b.id}: ${Object.keys(patch).join(', ')}.` : 'Update failed to sync.';
  }

  private async deleteBooking(a: Record<string, unknown>): Promise<string> {
    const b = typeof a.booking_id === 'string' ? this.bookings.find((x) => x.id === a.booking_id) : undefined;
    if (!b) return 'Booking not found — call get_itinerary for current ids.';
    const ok = await db.deleteBooking(b.id);
    if (ok) this.bookings = this.bookings.filter((x) => x.id !== b.id);
    return ok ? `Removed "${b.title}" (${b.id}).` : 'Delete failed to sync.';
  }
}
