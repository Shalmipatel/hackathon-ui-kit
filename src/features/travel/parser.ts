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

import type { Booking, BookingType, Place } from './types';

const CONTRACT_VERSION = 'bookings/v1';
const FENCE_RE = /```(?:json|wanderbot)?\s*\n([\s\S]*?)```/gi;

export interface ParsedBookings {
  /** Validated, ready-to-upsert bookings. */
  bookings: Booking[];
  /** Trip id the bookings should attach to, when the payload specified one. */
  tripId?: string;
  /** Strings that looked like wanderbot blocks but failed validation. */
  errors: string[];
}

export const EMPTY_PARSE: ParsedBookings = { bookings: [], errors: [] };

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
