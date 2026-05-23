export type BookingType = 'flight' | 'hotel' | 'activity' | 'restaurant' | 'transport';

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
  /** ISO timestamp (UTC). For multi-day bookings, this is the start. */
  start: string;
  /** ISO timestamp. Optional — flights/activities have explicit ends; hotels use checkout. */
  end?: string;
  /** Confirmation / record locator from the booking provider. */
  confirmation?: string;
  /** "Delta", "Marriott", "Airbnb", etc. */
  provider?: string;
  source: BookingSource;
  notes?: string;
  /** Original email subject when source==='email'. */
  emailSubject?: string;
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
}

export interface ScanStatus {
  /** Provider id whose inbox the agent is scanning (e.g. 'Gmail'). */
  provider: string;
  status: 'idle' | 'scanning' | 'done' | 'error';
  found?: number;
  message?: string;
  startedAt?: number;
}
