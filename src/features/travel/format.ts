import type { Booking, Trip } from './types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Returns YYYY-MM-DD for a Date in its local-time-of-the-stamp parts.
 *  Important: we use the *string* date portion, not UTC conversion, so a
 *  flight stamped 11:25 PT and a hotel stamped 15:00 JST on the same trip
 *  day still group correctly. */
export function localDateKey(iso: string): string {
  // ISO strings carry their own offset; slice off the date+time portion and
  // re-build using the local components.
  const d = new Date(iso);
  const tzOffset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - tzOffset * 60_000);
  return local.toISOString().slice(0, 10);
}

/** "Sat, Jun 13" */
export function formatDayLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** "Jun 12 – Jun 22, 2026" */
export function formatTripRange(trip: Trip): string {
  const [sy, sm, sd] = trip.startDate.split('-').map(Number);
  const [ey, em, ed] = trip.endDate.split('-').map(Number);
  const start = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  const sameYear = start.getFullYear() === end.getFullYear();
  const startStr = `${MONTHS[start.getMonth()]} ${start.getDate()}`;
  const endStr = `${MONTHS[end.getMonth()]} ${end.getDate()}`;
  return sameYear
    ? `${startStr} – ${endStr}, ${end.getFullYear()}`
    : `${startStr}, ${start.getFullYear()} – ${endStr}, ${end.getFullYear()}`;
}

/** "11:25 AM" — local to the ISO offset (so a JST timestamp prints as JST). */
export function formatTimeOfDay(iso: string): string {
  // Build a "wall clock" Date from the offset-aware string parts so the
  // displayed time matches the booking's local timezone, not the user's.
  const match = iso.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/,
  );
  if (!match) return '';
  const hour = Number(match[4]);
  const min = match[5];
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = ((hour + 11) % 12) + 1;
  return `${hour12}:${min} ${period}`;
}

export function formatDuration(start: string, end?: string): string {
  if (!end) return '';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const totalMin = Math.round(ms / 60_000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  return `${mins}m`;
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

/** Days between trip start and end, inclusive. */
export function tripDayKeys(trip: Trip): string[] {
  const [sy, sm, sd] = trip.startDate.split('-').map(Number);
  const [ey, em, ed] = trip.endDate.split('-').map(Number);
  const start = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  const days: string[] = [];
  const cur = new Date(start);
  while (cur.getTime() <= end.getTime()) {
    days.push(
      `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`,
    );
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export function bookingDayKey(booking: Booking): string {
  return localDateKey(booking.start);
}

/** Returns a lat/lng pair representative of the booking's location. */
export function bookingLocation(booking: Booking): { lat: number; lng: number; label: string } | null {
  switch (booking.type) {
    case 'flight':
    case 'transport':
      return { lat: booking.to.lat, lng: booking.to.lng, label: booking.to.name };
    case 'hotel':
    case 'activity':
    case 'restaurant':
      return {
        lat: booking.place.lat,
        lng: booking.place.lng,
        label: booking.place.name,
      };
  }
}
