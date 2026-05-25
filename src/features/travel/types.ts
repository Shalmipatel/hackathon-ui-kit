export type BookingType =
  | 'flight'
  | 'hotel'
  /** Museums, monuments, landmarks, viewpoints — sightseeing
   *  with an entry queue. */
  | 'attraction'
  /** Classes, tastings, workshops, spas — hands-on / learning
   *  / wellness. */
  | 'experience'
  /** Shows, concerts, sports games, theme parks — scheduled
   *  entertainment. */
  | 'event'
  /** Catch-all for anything that doesn't fit the more specific
   *  buckets above. Manually-added places default here. */
  | 'activity'
  | 'restaurant'
  | 'transport';

export type BookingSource = 'email' | 'agent' | 'manual';

export interface Place {
  name: string;
  address?: string;
  lat: number;
  lng: number;
}

interface BookingBase {
  id: string;
  tripId: string;
  type: BookingType;
  title: string;
  /** YYYY-MM-DD — which day this booking lives in. Required. For
   *  timed items this also matches the date prefix of `start`; for
   *  untimed items it's the only thing that ties the booking to a
   *  day. */
  dayKey: string;
  /** Within-day sort key. Items in a day render sorted by `position`
   *  ascending. A float so drop-between-two-items can pick midpoints
   *  without renumbering siblings.
   *
   *  Convention: for items with a real time, the initial value is
   *  the wall-clock seconds since midnight (e.g. 3 PM → 54000).
   *  Drag-reorder produces fractional midpoints. */
  position: number;
  /** ISO timestamp. OPTIONAL — items without `start` are "untimed"
   *  (no time column rendered, sort is purely positional). When
   *  present this is the start of a single- or multi-day span. */
  start?: string;
  /** ISO timestamp. Optional — flights/activities have explicit ends; hotels use checkout. */
  end?: string;
  /** @deprecated Replaced by the presence/absence of `start` (untimed
   *  bookings now have no `start` at all). Kept on the type so legacy
   *  records that haven't been re-saved still type-check; the read
   *  migration in useFirebaseSync strips it. */
  hasTime?: boolean;
  /** Confirmation / record locator from the booking provider. */
  confirmation?: string;
  /** "Delta", "Marriott", "Airbnb", etc. */
  provider?: string;
  source: BookingSource;
  notes?: string;
  /** Original email subject when source==='email'. */
  emailSubject?: string;
  /** Deep-link back to the original record — Gmail message URL,
   *  airline "Manage Trip" page, hotel reservation page, etc. */
  link?: string;
  cost?: { amount: number; currency: string };
}

export interface FlightBooking extends BookingBase {
  type: 'flight';
  flightNumber?: string;
  from: Place;
  to: Place;
  /** Cabin / fare class — display-only. */
  cabin?: string;
}

export interface HotelBooking extends BookingBase {
  type: 'hotel';
  place: Place;
  /** Nights derived from start/end, but stored for quick render. */
  nights?: number;
}

export interface ActivityBooking extends BookingBase {
  type: 'activity';
  place: Place;
}

export interface AttractionBooking extends BookingBase {
  type: 'attraction';
  place: Place;
}

export interface ExperienceBooking extends BookingBase {
  type: 'experience';
  place: Place;
}

export interface EventBooking extends BookingBase {
  type: 'event';
  place: Place;
}

export interface RestaurantBooking extends BookingBase {
  type: 'restaurant';
  place: Place;
  partySize?: number;
}

export interface TransportBooking extends BookingBase {
  type: 'transport';
  from: Place;
  to: Place;
  /** "Train", "Ferry", "Rental car", etc. */
  mode?: string;
}

export type Booking =
  | FlightBooking
  | HotelBooking
  | ActivityBooking
  | AttractionBooking
  | ExperienceBooking
  | EventBooking
  | RestaurantBooking
  | TransportBooking;

export interface Trip {
  id: string;
  title: string;
  /** Primary destination, e.g. "Tokyo, Japan". */
  destination: string;
  /** ISO date (YYYY-MM-DD) — first day of trip. */
  startDate: string;
  endDate: string;
  /** Hex string for the trip card accent. */
  color: string;
  travelers?: string[];
  /** Free-form, used as agent context. */
  summary?: string;
  /** Optional cover photo URL. */
  cover?: string;
  /** Chat-store session id dedicated to this trip. Created at trip
   *  creation time (or lazily on first selection for seeded trips). */
  chatSessionId?: string;
  /** Manually archived by the user. Past-by-date trips show in the
   *  same folded section without needing this flag. */
  archived?: boolean;
}

export interface ScanStatus {
  /** Provider id whose inbox the agent is scanning (e.g. 'Gmail'). */
  provider: string;
  status: 'idle' | 'scanning' | 'done' | 'error';
  found?: number;
  message?: string;
  startedAt?: number;
}
