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

/** Returns YYYY-MM-DD for a booking timestamp, preserving the *stamp's*
 *  timezone rather than the viewer's. A JST 9:00 AM stays on its JST
 *  calendar day even when viewed from PT — otherwise booking like
 *  `2026-06-15T09:00:00+09:00` would render under Jun 14 for a US user
 *  because `new Date(...).toISOString()` normalizes to UTC. The date
 *  portion of an ISO 8601 string is already in the stamp's offset, so
 *  slicing the leading 10 chars is correct. */
export function localDateKey(iso: string): string {
  const match = iso.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : iso.slice(0, 10);
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

/** Every YYYY-MM-DD a booking covers, inclusive. Single-day events
 *  return a one-element array; a hotel from Jun 13 → Jun 17 returns
 *  [Jun 13, Jun 14, Jun 15, Jun 16, Jun 17] so it renders on every
 *  night of the stay, not just the check-in day. Uses local-date
 *  semantics (same as `localDateKey`) so a JST stamp stays on its
 *  own calendar regardless of the viewer's timezone. */
export function bookingDayKeys(booking: Booking): string[] {
  const startKey = localDateKey(booking.start);
  if (!booking.end) return [startKey];
  const endKey = localDateKey(booking.end);
  if (endKey === startKey) return [startKey];

  const [sy, sm, sd] = startKey.split('-').map(Number);
  const [ey, em, ed] = endKey.split('-').map(Number);
  /* Construct in local time to step calendar days without DST drift. */
  const cur = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  if (end.getTime() < cur.getTime()) return [startKey];
  const keys: string[] = [];
  while (cur.getTime() <= end.getTime()) {
    keys.push(
      `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`,
    );
    cur.setDate(cur.getDate() + 1);
  }
  return keys;
}

/** Splice a wall-clock HH:MM into an ISO timestamp without disturbing
 *  the calendar day or any timezone offset suffix. Examples:
 *
 *    replaceIsoTime("2026-06-15T09:30:00+09:00", "14", "00")
 *      → "2026-06-15T14:00:00+09:00"
 *    replaceIsoTime("2026-06-15T12:00:00", "08", "45")
 *      → "2026-06-15T08:45:00"
 *
 *  Used when the user picks a time via `<input type="time">` — that
 *  control yields "HH:MM" in 24-hour wall-clock form, no offset. */
export function replaceIsoTime(iso: string, hh: string, mm: string): string {
  const match = iso.match(
    /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(.*)$/,
  );
  if (!match) {
    const dateOnly = iso.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!dateOnly) return iso;
    return `${dateOnly[1]}T${hh.padStart(2, '0')}:${mm.padStart(2, '0')}:00`;
  }
  const [, datePart, tzSuffix] = match;
  return `${datePart}T${hh.padStart(2, '0')}:${mm.padStart(2, '0')}:00${tzSuffix}`;
}

/** Splice a YYYY-MM-DD into an ISO timestamp, preserving time and tz. */
export function replaceIsoDate(iso: string, newDateKey: string): string {
  const match = iso.match(/^\d{4}-\d{2}-\d{2}(.*)$/);
  if (!match) return newDateKey;
  return `${newDateKey}${match[1]}`;
}

/** Extract "HH:MM" (24h) from an ISO timestamp for `<input type="time">`. */
export function isoTimeOnly(iso: string): string {
  const match = iso.match(/T(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : '';
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
