/**
 * Booking ingestion contract — wire format the agent emits inside chat
 * messages so the UI can pull structured bookings out without prose
 * parsing.
 *
 *     ```json
 *     {
 *       "wanderbot": "bookings/v1",
 *       "tripId": "trip-tokyo-2026",        // optional; defaults to active trip
 *       "bookings": [ { "type": "flight", ... } ]
 *     }
 *     ```
 *
 * Multiple blocks per message are allowed and aggregated. Unknown fields
 * are ignored; missing required fields cause that single booking to be
 * dropped (the rest of the batch still applies). All validation is
 * intentionally lenient: hackathon agents will produce slightly-off
 * shapes and we want to do best-effort ingestion rather than throw the
 * whole payload away.
 */

import type { Booking, BookingType, Place, Trip } from './types';

const CONTRACT_VERSION = 'bookings/v1';
const TRIPS_CONTRACT_VERSION = 'trips/v1';
const FENCE_RE = /```(?:json|wanderbot)?\s*\n([\s\S]*?)```/gi;
const HEX_COLOR_RE = /^#[0-9a-f]{3,8}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TRIP_COLOR_PALETTE = ['#216869', '#49A078', '#38bdf8', '#a855f7', '#f87171', '#fb923c'];

export interface ParsedBookings {
  /** Validated, ready-to-upsert bookings. */
  bookings: Booking[];
  /** Trip id the bookings should attach to, when the payload specified one. */
  tripId?: string;
  /** Strings that looked like wanderbot blocks but failed validation. */
  errors: string[];
}

export interface ParsedTrips {
  trips: Trip[];
  errors: string[];
}

export const EMPTY_PARSE: ParsedBookings = { bookings: [], errors: [] };
export const EMPTY_TRIPS_PARSE: ParsedTrips = { trips: [], errors: [] };

export function parseBookingsFromMessage(content: string): ParsedBookings {
  if (!content || !content.includes(CONTRACT_VERSION)) return EMPTY_PARSE;
  const out: ParsedBookings = { bookings: [], errors: [] };

  const blocks = extractJsonBlocks(content);
  for (const raw of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Probably a code sample, not our payload — skip silently.
      continue;
    }
    if (!isWanderbotPayload(parsed)) continue;

    if (parsed.tripId && !out.tripId) out.tripId = String(parsed.tripId);

    for (let i = 0; i < parsed.bookings.length; i++) {
      const validated = validateBooking(parsed.bookings[i], out.tripId);
      if (validated.ok) {
        out.bookings.push(validated.booking);
      } else {
        out.errors.push(`booking[${i}]: ${validated.reason}`);
      }
    }
  }

  return out;
}

function extractJsonBlocks(content: string): string[] {
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  FENCE_RE.lastIndex = 0;
  while ((match = FENCE_RE.exec(content)) !== null) {
    const body = match[1].trim();
    if (body.includes(CONTRACT_VERSION)) blocks.push(body);
  }
  return blocks;
}

/** Trip-discovery blocks use a separate version string so the bookings
 *  parser doesn't accidentally consume them. */
function extractTripBlocks(content: string): string[] {
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  FENCE_RE.lastIndex = 0;
  while ((match = FENCE_RE.exec(content)) !== null) {
    const body = match[1].trim();
    if (body.includes(TRIPS_CONTRACT_VERSION)) blocks.push(body);
  }
  return blocks;
}

export function parseTripsFromMessage(content: string): ParsedTrips {
  if (!content || !content.includes(TRIPS_CONTRACT_VERSION)) return EMPTY_TRIPS_PARSE;
  const out: ParsedTrips = { trips: [], errors: [] };

  const blocks = extractTripBlocks(content);
  for (const raw of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!isTripsPayload(parsed)) continue;

    for (let i = 0; i < parsed.trips.length; i++) {
      const validated = validateTrip(parsed.trips[i], out.trips.length);
      if (validated.ok) {
        out.trips.push(validated.trip);
      } else {
        out.errors.push(`trip[${i}]: ${validated.reason}`);
      }
    }
  }

  return out;
}

function isTripsPayload(
  value: unknown,
): value is { wanderbot: string; trips: unknown[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { wanderbot?: unknown }).wanderbot === TRIPS_CONTRACT_VERSION &&
    Array.isArray((value as { trips?: unknown }).trips)
  );
}

type TripValidationResult =
  | { ok: true; trip: Trip }
  | { ok: false; reason: string };

function validateTrip(input: unknown, paletteIndex: number): TripValidationResult {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, reason: 'not an object' };
  }
  const obj = input as Record<string, unknown>;
  const title = obj.title;
  if (typeof title !== 'string' || !title.trim()) {
    return { ok: false, reason: 'missing title' };
  }
  const destination = obj.destination;
  if (typeof destination !== 'string' || !destination.trim()) {
    return { ok: false, reason: 'missing destination' };
  }
  const startDate = obj.startDate;
  if (typeof startDate !== 'string' || !ISO_DATE_RE.test(startDate)) {
    return { ok: false, reason: 'missing/invalid startDate (YYYY-MM-DD)' };
  }
  const endDate = obj.endDate;
  if (typeof endDate !== 'string' || !ISO_DATE_RE.test(endDate)) {
    return { ok: false, reason: 'missing/invalid endDate (YYYY-MM-DD)' };
  }

  const id =
    typeof obj.id === 'string' && obj.id.trim()
      ? obj.id
      : `trip-${slugify(title)}-${hashString(`${title}|${startDate}|${endDate}`)}`;
  const color =
    typeof obj.color === 'string' && HEX_COLOR_RE.test(obj.color)
      ? obj.color
      : TRIP_COLOR_PALETTE[paletteIndex % TRIP_COLOR_PALETTE.length];

  const travelers =
    Array.isArray(obj.travelers)
      ? (obj.travelers.filter((t): t is string => typeof t === 'string' && t.trim().length > 0))
      : undefined;

  return {
    ok: true,
    trip: {
      id,
      title: title.trim(),
      destination: destination.trim(),
      startDate,
      endDate,
      color,
      travelers,
      summary: typeof obj.summary === 'string' ? obj.summary : undefined,
      cover: typeof obj.cover === 'string' ? obj.cover : undefined,
    },
  };
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'trip'
  );
}

function isWanderbotPayload(
  value: unknown,
): value is { wanderbot: string; tripId?: unknown; bookings: unknown[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { wanderbot?: unknown }).wanderbot === CONTRACT_VERSION &&
    Array.isArray((value as { bookings?: unknown }).bookings)
  );
}

type ValidationResult =
  | { ok: true; booking: Booking }
  | { ok: false; reason: string };

const VALID_TYPES: BookingType[] = [
  'flight',
  'hotel',
  'activity',
  'restaurant',
  'transport',
];

function validateBooking(input: unknown, defaultTripId?: string): ValidationResult {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, reason: 'not an object' };
  }
  const obj = input as Record<string, unknown>;

  const type = obj.type;
  if (typeof type !== 'string' || !VALID_TYPES.includes(type as BookingType)) {
    return { ok: false, reason: `unknown type ${JSON.stringify(type)}` };
  }
  const title = obj.title;
  if (typeof title !== 'string' || !title.trim()) {
    return { ok: false, reason: 'missing title' };
  }
  const start = obj.start;
  if (typeof start !== 'string' || isNaN(Date.parse(start))) {
    return { ok: false, reason: 'missing or invalid start' };
  }
  const tripId = typeof obj.tripId === 'string' ? obj.tripId : defaultTripId;
  if (!tripId) {
    return { ok: false, reason: 'no tripId (and no default)' };
  }

  const id = typeof obj.id === 'string' && obj.id.trim()
    ? obj.id
    : `agent-${type}-${hashString(`${tripId}|${title}|${start}`)}`;

  const base = {
    id,
    tripId,
    title: title.trim(),
    start,
    end: typeof obj.end === 'string' ? obj.end : undefined,
    confirmation: typeof obj.confirmation === 'string' ? obj.confirmation : undefined,
    provider: typeof obj.provider === 'string' ? obj.provider : undefined,
    source: 'agent' as const,
    notes: typeof obj.notes === 'string' ? obj.notes : undefined,
    emailSubject:
      typeof obj.emailSubject === 'string' ? obj.emailSubject : undefined,
    cost: isCost(obj.cost) ? obj.cost : undefined,
  };

  switch (type as BookingType) {
    case 'flight': {
      const from = parsePlace(obj.from);
      const to = parsePlace(obj.to);
      if (!from || !to) return { ok: false, reason: 'flight needs from + to with lat/lng' };
      return {
        ok: true,
        booking: {
          ...base,
          type: 'flight',
          from,
          to,
          flightNumber:
            typeof obj.flightNumber === 'string' ? obj.flightNumber : undefined,
          cabin: typeof obj.cabin === 'string' ? obj.cabin : undefined,
        },
      };
    }
    case 'transport': {
      const from = parsePlace(obj.from);
      const to = parsePlace(obj.to);
      if (!from || !to) return { ok: false, reason: 'transport needs from + to' };
      return {
        ok: true,
        booking: {
          ...base,
          type: 'transport',
          from,
          to,
          mode: typeof obj.mode === 'string' ? obj.mode : undefined,
        },
      };
    }
    case 'hotel': {
      const place = parsePlace(obj.place);
      if (!place) return { ok: false, reason: 'hotel needs place with lat/lng' };
      return {
        ok: true,
        booking: {
          ...base,
          type: 'hotel',
          place,
          nights:
            typeof obj.nights === 'number' && Number.isFinite(obj.nights)
              ? obj.nights
              : undefined,
        },
      };
    }
    case 'activity': {
      const place = parsePlace(obj.place);
      if (!place) return { ok: false, reason: 'activity needs place' };
      return { ok: true, booking: { ...base, type: 'activity', place } };
    }
    case 'restaurant': {
      const place = parsePlace(obj.place);
      if (!place) return { ok: false, reason: 'restaurant needs place' };
      return {
        ok: true,
        booking: {
          ...base,
          type: 'restaurant',
          place,
          partySize:
            typeof obj.partySize === 'number' && Number.isFinite(obj.partySize)
              ? obj.partySize
              : undefined,
        },
      };
    }
  }
}

function parsePlace(value: unknown): Place | null {
  if (typeof value !== 'object' || value === null) return null;
  const obj = value as Record<string, unknown>;
  const name = obj.name;
  const lat = obj.lat;
  const lng = obj.lng;
  if (
    typeof name !== 'string' ||
    typeof lat !== 'number' ||
    !Number.isFinite(lat) ||
    typeof lng !== 'number' ||
    !Number.isFinite(lng)
  ) {
    return null;
  }
  return {
    name,
    lat,
    lng,
    address: typeof obj.address === 'string' ? obj.address : undefined,
  };
}

function isCost(value: unknown): value is { amount: number; currency: string } {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.amount === 'number' &&
    Number.isFinite(obj.amount) &&
    typeof obj.currency === 'string' &&
    obj.currency.length > 0
  );
}

/** Tiny stable hash for synthesizing booking ids when the agent omits one. */
function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

/* ───────── System-prompt snippet — share with the agent so it knows
   the contract. Re-exported by index.ts. ───────── */

export const BOOKING_CONTRACT_PROMPT = `When you have new or updated bookings to add to the user's trip board, emit them in a fenced JSON block using this exact schema. You may include normal prose around the block.

\`\`\`json
{
  "wanderbot": "bookings/v1",
  "tripId": "<trip id from the provided context, or omit to attach to the active trip>",
  "bookings": [
    {
      "type": "flight" | "hotel" | "activity" | "restaurant" | "transport",
      "title": "Short label, e.g. SFO → HND",
      "start": "ISO 8601 with offset, e.g. 2026-06-12T11:25:00-07:00",
      "end": "ISO 8601 with offset (optional)",
      "confirmation": "Record locator or PNR (optional)",
      "provider": "Airline / chain / OTA (optional)",
      "cost": { "amount": 1840, "currency": "USD" },
      // Place fields depend on type:
      //   flight | transport: from + to (each { name, address?, lat, lng })
      //   hotel | activity | restaurant: place ({ name, address?, lat, lng })
      "from": { "name": "SFO", "lat": 37.6213, "lng": -122.379 },
      "to":   { "name": "HND", "lat": 35.5494, "lng": 139.7798 }
    }
  ]
}
\`\`\`

Rules:
- Always include lat/lng — they're required for the map.
- Use full ISO 8601 with timezone offset.
- One block per response is fine; multiple are okay if grouping helps.
- Don't emit a block if you're only commenting on existing bookings.`;

/** Prompt for the trip-discovery scan. Asks the agent to detect
 *  coherent trips from the user's connected sources (Gmail, calendar,
 *  travel-site sessions) and emit them in the trips/v1 wire shape.
 *  Booking emission is optional — if the agent can extract per-trip
 *  bookings it can include a bookings/v1 block per trip, using the
 *  trip id from the trips/v1 block as tripId. */
export const TRIP_DISCOVERY_PROMPT = `Scan EVERY one of my connected sources for trip evidence, not just Gmail. You MUST attempt all of these, even if some return nothing:

SOURCES TO CHECK (each is its own pass — do not stop after the first):
1. **Gmail** — search for travel-confirmation keywords (booking, itinerary, confirmation, reservation, e-ticket, boarding pass). Use the Google skill (gog) if you have it.
2. **Airbnb** — open https://www.airbnb.com/trips/v1 (Trips dashboard) in the connected browser session. Read upcoming + past reservations. Extract host name, check-in/check-out, lat/lng of the listing, confirmation code.
3. **Booking.com** — https://secure.booking.com/myreservations.html — same pattern.
4. **Airline sites** (Delta, United, JAL, Lufthansa, TAP, Air France, etc.) — if any are logged in, open their "My trips" / "Manage reservations" page and pull current flights.
5. **Marriott / Hyatt / Hilton** — "My stays" pages for hotel reservations.
6. **Google Calendar** — events tagged with destinations or matching flight/hotel descriptions.
7. **OpenTable / Resy** — upcoming restaurant reservations.

For EACH source, log a brief note in the chat ("Checked Airbnb: found N reservations") so I can see what was tried. Then group related bookings — flights, hotels, activities clustered around the same destination + date range — into one "trip". For each trip, emit a wanderbot trips/v1 JSON block:

\`\`\`json
{
  "wanderbot": "trips/v1",
  "trips": [
    {
      "id": "trip-tokyo-2026",
      "title": "Tokyo + Kyoto",
      "destination": "Japan",
      "startDate": "2026-06-12",
      "endDate": "2026-06-22",
      "color": "#216869",
      "travelers": ["..."],
      "summary": "Optional one-liner — 10 days, Tokyo first then shinkansen to Kyoto"
    }
  ]
}
\`\`\`

Rules:
- title is short ("Tokyo + Kyoto" not "Trip to Japan in June 2026").
- destination is the primary country / region.
- startDate / endDate are ISO YYYY-MM-DD strings.
- color is optional; pick a memorable hex per trip if you can.
- id is REQUIRED if you also emit bookings (so they can reference the trip via tripId). Pick a stable slug like "trip-tokyo-2026".
- **Every trip MUST have at least one booking attached in the same response** — emit a bookings/v1 block whose entries reference the trip via tripId. A trip with no events is just a placeholder and will be dropped client-side. If you can't find any concrete bookings (flights, hotels, activities) for a candidate trip, do NOT include the trip at all.
- **Cross-source merging is required**: if a Gmail confirmation and an Airbnb reservation refer to the same trip (overlapping dates + same destination), merge them into one trips/v1 entry with multiple bookings — don't emit two duplicate trips.
- If you find no trips with concrete bookings across ALL sources, emit \`{ "wanderbot": "trips/v1", "trips": [] }\` so the user knows the scan ran.
- Do NOT stop the scan early because Gmail returned nothing — keep going through Airbnb, Booking, airlines, etc.`;
