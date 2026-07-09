// The declarative "dynamic view" system. The agent calls present_view with a
// loose block tree; sanitizeView() is the single trust boundary that turns
// that untrusted LLM output into a well-formed, cap-bounded, coordinate-safe,
// symbol-resolved View. The iMessage extension ships a fixed signed SwiftUI
// renderer that just switches on block.type and skips anything unknown.

import type { Trip, Booking, BookingType } from '../src/features/travel/types';
import type { Subject } from './tools.js';

export const VIEW_SCHEMA_VERSION = 1;

const BOOKING_TYPES: BookingType[] = [
  'flight', 'hotel', 'attraction', 'experience', 'event', 'activity', 'restaurant', 'transport',
];

// ---- Types ---------------------------------------------------------------

export interface ActionBooking {          // 1:1 with Tools.addBooking args (minus trip_id)
  type: BookingType;
  title: string;
  day?: string;
  start_time?: string;
  end_time?: string;
  end_day?: string;
  place_name?: string;
  place_lat?: number;
  place_lng?: number;
  provider?: string;
  link?: string;
  notes?: string;
  nights?: number;
}

export interface ViewAction {
  type: 'add_booking' | 'add_all' | 'open_app';
  label?: string;
  booking?: ActionBooking;
  href?: string;
}

export interface ListRow {
  id?: string;
  title: string;
  subtitle?: string;
  trailing?: string;
  note?: string;
  symbol?: string;
  bookingType?: BookingType;
  action?: ViewAction;
}
export interface CompareCol { id?: string; title: string; subtitle?: string; highlight?: boolean; action?: ViewAction; }
export interface WeatherDay { day: string; symbol: string; hi: string; lo: string; rain?: string; }
export interface MapPin { id?: string; title: string; lat: number; lng: number; symbol?: string; bookingType?: BookingType; action?: ViewAction; }
export interface TimelineItem { id?: string; time?: string; title: string; subtitle?: string; symbol?: string; bookingType?: BookingType; action?: ViewAction; }

export type Block =
  | { type: 'note'; text: string; tone?: 'info' | 'tip' | 'warn' }
  | { type: 'stats'; items: { value: string; label: string }[] }
  | { type: 'hero_stat'; label: string; value: string; caption?: string }
  | { type: 'keyvalue'; title?: string; rows: { label: string; value: string; icon?: string }[] }
  | { type: 'list'; id?: string; title?: string; style?: 'cards' | 'checklist'; rows: ListRow[] }
  | { type: 'compare'; id?: string; columns: CompareCol[]; rows: { label: string; vals: string[] }[] }
  | { type: 'weather'; unit?: 'F' | 'C'; days: WeatherDay[] }
  | { type: 'map'; pins: MapPin[] }
  | { type: 'timeline'; title?: string; items: TimelineItem[] }
  | { type: 'budget'; currency?: string; total?: string; items: { label: string; amount: number; bookingType?: BookingType }[] }
  | { type: 'actions'; buttons: ViewAction[] };

export type ViewCategory =
  | 'dining' | 'weather' | 'packing' | 'compare' | 'plan' | 'budget' | 'places' | 'generic';

export interface View {
  v: number;
  id: string;
  kind: 'view';
  scene?: string;
  accent?: string;
  title: string;
  subtitle?: string;
  eyebrow?: string;
  tripId?: string;
  category: ViewCategory;
  blocks: Block[];
  createdAt: number;
  expiresAt: number;
  added?: Record<string, { bookingId: string; at: number }>;
}

// ---- Scene classifier (shared with card.ts) ------------------------------

const SCENES = ['mountain', 'city', 'coast', 'desert', 'forest', 'snow', 'aurora', 'river'];

/** Landscape scene for a destination — mirrors WBScene.classify in the iOS
 *  extension so the /og bubble PNG and the native hero show the same world. */
export function sceneFor(text: string): string {
  const s = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const hit = (w: string[]) => w.some((x) => s.includes(x));
  if (hit(['beach', 'island', 'coast', 'maui', 'oahu', 'kauai', 'hawaii', 'honolulu', 'bali', 'cancun',
           'tulum', 'cabo', 'playa', 'miami', 'caribbean', 'fiji', 'phuket', 'malibu', 'san diego',
           'amalfi', 'santorini', 'riviera'])) return 'coast';
  if (hit(['aurora', 'northern lights', 'iceland', 'reykjavik', 'tromso', 'alaska', 'fairbanks',
           'lofoten', 'greenland'])) return 'aurora';
  if (hit(['snow', 'ski ', 'skiing', 'aspen', 'whistler', 'vail', 'lapland', 'hokkaido', 'niseko',
           'antarctica', 'arctic', 'chamonix'])) return 'snow';
  if (hit(['desert', 'sahara', 'dubai', 'abu dhabi', 'phoenix', 'scottsdale', 'sedona', 'arizona',
           'moab', 'joshua tree', 'palm springs', 'marrakech', 'morocco', 'atacama', 'mojave',
           'death valley'])) return 'desert';
  if (hit(['forest', 'jungle', 'rainforest', 'redwood', 'sequoia', 'yosemite', 'smoky',
           'olympic national', 'costa rica', 'amazon', 'black forest'])) return 'forest';
  if (hit(['river', 'lake', 'laguna', 'lagoon', 'venice', 'amsterdam', 'bangkok', 'atitlan', 'como',
           'bled', 'mekong', 'danube'])) return 'river';
  if (hit(['new york', 'nyc', 'manhattan', 'tokyo', 'london', 'paris', 'chicago', 'san francisco',
           'seattle', 'berlin', 'barcelona', 'madrid', 'rome', 'milan', 'singapore', 'hong kong',
           'seoul', 'toronto', 'boston', 'austin', 'las vegas', 'vegas', 'city'])) return 'city';
  return 'mountain';
}

// ---- Symbol allow-list (kept in sync with iOS WBSym.resolve) -------------

const TYPE_SYMBOL: Record<BookingType, string> = {
  flight: 'airplane', hotel: 'bed.double.fill', restaurant: 'fork.knife',
  attraction: 'building.columns.fill', experience: 'sparkles', event: 'ticket.fill',
  activity: 'figure.walk', transport: 'tram.fill',
};

// Curated SF Symbols the renderer is guaranteed to have a glyph for.
const SYMBOL_ALLOW = new Set<string>([
  ...Object.values(TYPE_SYMBOL),
  // weather
  'sun.max.fill', 'moon.stars.fill', 'cloud.fill', 'cloud.sun.fill', 'cloud.moon.fill',
  'cloud.rain.fill', 'cloud.drizzle.fill', 'cloud.heavyrain.fill', 'cloud.snow.fill',
  'cloud.bolt.fill', 'cloud.bolt.rain.fill', 'cloud.fog.fill', 'wind', 'snowflake',
  'sunrise.fill', 'sunset.fill', 'thermometer.medium', 'humidity.fill', 'drop.fill',
  // util / keyvalue icons
  'mappin', 'mappin.circle', 'mappin.circle.fill', 'location.fill', 'clock', 'clock.fill',
  'calendar', 'dollarsign.circle.fill', 'creditcard.fill', 'star.fill', 'checkmark.circle.fill',
  'info.circle.fill', 'lightbulb.fill', 'exclamationmark.triangle.fill', 'bag.fill',
  'car.fill', 'ferry.fill', 'bus.fill', 'tram.fill', 'figure.walk', 'fork.knife', 'cup.and.saucer.fill',
  'wineglass.fill', 'camera.fill', 'photo.fill', 'ticket.fill', 'sparkles', 'suitcase.fill',
  'moon.fill', 'globe.americas.fill', 'flag.fill', 'phone.fill', 'wifi', 'fuelpump.fill',
]);

/** Resolve a symbol token to a guaranteed-valid SF Symbol: booking-type raws
 *  map to their glyph, allow-listed symbols pass through, everything else
 *  falls back so the renderer never shows a missing-glyph box. */
function resolveSymbol(token: unknown, fallback = 'mappin.circle'): string {
  if (typeof token !== 'string' || !token) return fallback;
  if (BOOKING_TYPES.includes(token as BookingType)) return TYPE_SYMBOL[token as BookingType];
  if (SYMBOL_ALLOW.has(token)) return token;
  return fallback;
}

// ---- small helpers -------------------------------------------------------

const s = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const clamp = (v: unknown, n: number): string | undefined => { const t = s(v); return t ? t.slice(0, n) : undefined; };
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

function slug(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'x';
}

function bookingType(v: unknown): BookingType | undefined {
  return typeof v === 'string' && BOOKING_TYPES.includes(v as BookingType) ? (v as BookingType) : undefined;
}

/** The single trip the agent touched, if unambiguous — used to backfill a
 *  missing trip_id for add actions. */
export function uniqueTouchedTripId(touched: Subject[]): string | undefined {
  const ids = new Set(touched.map((t) => t.trip?.id).filter(Boolean) as string[]);
  return ids.size === 1 ? [...ids][0] : undefined;
}

// ---- Action sanitizer ----------------------------------------------------

function cleanBooking(raw: any): ActionBooking | null {
  if (!raw || typeof raw !== 'object') return null;
  const type = bookingType(raw.type) ?? 'activity';
  const title = clamp(raw.title, 80);
  if (!title) return null;
  const b: ActionBooking = { type, title };
  const day = s(raw.day); if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) b.day = day;
  const endDay = s(raw.end_day); if (endDay && /^\d{4}-\d{2}-\d{2}$/.test(endDay)) b.end_day = endDay;
  const st = s(raw.start_time); if (st && /^\d{1,2}:\d{2}$/.test(st)) b.start_time = st;
  const et = s(raw.end_time); if (et && /^\d{1,2}:\d{2}$/.test(et)) b.end_time = et;
  const pn = clamp(raw.place_name, 80); if (pn) b.place_name = pn;
  const lat = num(raw.place_lat), lng = num(raw.place_lng);
  if (lat !== undefined && lng !== undefined) { b.place_lat = lat; b.place_lng = lng; }
  const prov = clamp(raw.provider, 60); if (prov) b.provider = prov;
  const link = s(raw.link); if (link && /^https?:\/\//.test(link)) b.link = link;
  const notes = clamp(raw.notes, 200); if (notes) b.notes = notes;
  const nights = num(raw.nights); if (nights !== undefined) b.nights = Math.round(nights);
  return b;
}

/** Returns [action|undefined]. Add actions with an invalid booking, or no
 *  trip context, are dropped (the content stays). */
function cleanAction(raw: any, hasTrip: boolean): ViewAction | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const t = raw.type;
  if (t === 'open_app') {
    const href = s(raw.href);
    return { type: 'open_app', label: clamp(raw.label, 20), href: href?.startsWith('/') ? href : '/' };
  }
  if (t === 'add_all') return hasTrip ? { type: 'add_all', label: clamp(raw.label, 20) } : undefined;
  if (t === 'add_booking') {
    if (!hasTrip) return undefined;
    const booking = cleanBooking(raw.booking);
    if (!booking) return undefined;
    return { type: 'add_booking', label: clamp(raw.label, 20), booking };
  }
  return undefined;
}

// ---- Block sanitizers ----------------------------------------------------

function cleanBlock(raw: any, hasTrip: boolean): Block | null {
  if (!raw || typeof raw !== 'object') return null;
  switch (raw.type) {
    case 'note': {
      const text = clamp(raw.text, 280); if (!text) return null;
      const tone = ['info', 'tip', 'warn'].includes(raw.tone) ? raw.tone : undefined;
      return { type: 'note', text, ...(tone ? { tone } : {}) };
    }
    case 'stats': {
      const items = arr(raw.items).map((i) => ({ value: clamp(i?.value, 16), label: clamp(i?.label, 14) }))
        .filter((i) => i.value && i.label).slice(0, 4) as { value: string; label: string }[];
      return items.length >= 2 ? { type: 'stats', items } : null;
    }
    case 'hero_stat': {
      const value = clamp(raw.value, 24), label = clamp(raw.label, 20);
      if (!value || !label) return null;
      return { type: 'hero_stat', value, label, ...(clamp(raw.caption, 60) ? { caption: clamp(raw.caption, 60)! } : {}) };
    }
    case 'keyvalue': {
      const rows = arr(raw.rows).map((r) => ({
        label: clamp(r?.label, 40), value: clamp(r?.value, 120), icon: r?.icon ? resolveSymbol(r.icon, 'info.circle.fill') : undefined,
      })).filter((r) => r.label && r.value).slice(0, 8) as { label: string; value: string; icon?: string }[];
      return rows.length ? { type: 'keyvalue', title: clamp(raw.title, 40), rows } : null;
    }
    case 'list': {
      const style = raw.style === 'checklist' ? 'checklist' : 'cards';
      const rows: ListRow[] = arr(raw.rows).map((r) => {
        const title = clamp(r?.title, 80); if (!title) return null;
        const action = cleanAction(r?.action, hasTrip);
        const id = s(r?.id) ?? (action ? slug(title) : undefined);
        return {
          id, title, subtitle: clamp(r?.subtitle, 100), trailing: clamp(r?.trailing, 24),
          note: clamp(r?.note, 100), symbol: r?.symbol ? resolveSymbol(r.symbol) : undefined,
          bookingType: bookingType(r?.bookingType), ...(action ? { action } : {}),
        } as ListRow;
      }).filter(Boolean).slice(0, 8) as ListRow[];
      return rows.length ? { type: 'list', id: s(raw.id), title: clamp(raw.title, 40), style, rows } : null;
    }
    case 'compare': {
      const columns: CompareCol[] = arr(raw.columns).map((c) => {
        const title = clamp(c?.title, 40); if (!title) return null;
        const action = cleanAction(c?.action, hasTrip);
        return { id: s(c?.id) ?? (action ? slug(title) : undefined), title, subtitle: clamp(c?.subtitle, 40),
                 highlight: c?.highlight === true, ...(action ? { action } : {}) } as CompareCol;
      }).filter(Boolean).slice(0, 3) as CompareCol[];
      if (columns.length < 2) return null;
      const rows = arr(raw.rows).map((r) => ({ label: clamp(r?.label, 30), vals: arr(r?.vals).map((v) => clamp(v, 40) ?? '') }))
        .filter((r) => r.label && r.vals.length === columns.length).slice(0, 8) as { label: string; vals: string[] }[];
      return { type: 'compare', id: s(raw.id), columns, rows };
    }
    case 'weather': {
      const days = arr(raw.days).map((d) => ({
        day: clamp(d?.day, 8), symbol: resolveSymbol(d?.symbol, 'cloud.fill'),
        hi: clamp(d?.hi, 6), lo: clamp(d?.lo, 6), rain: clamp(d?.rain, 6),
      })).filter((d) => d.day && d.hi && d.lo).slice(0, 8) as WeatherDay[];
      return days.length ? { type: 'weather', unit: raw.unit === 'C' ? 'C' : 'F', days } : null;
    }
    case 'map': {
      const pins: MapPin[] = arr(raw.pins).map((p) => {
        const title = clamp(p?.title, 60); const lat = num(p?.lat), lng = num(p?.lng);
        if (!title || lat === undefined || lng === undefined) return null;
        const action = cleanAction(p?.action, hasTrip);
        return { id: s(p?.id) ?? (action ? slug(title) : undefined), title, lat, lng,
                 symbol: p?.symbol ? resolveSymbol(p.symbol) : undefined,
                 bookingType: bookingType(p?.bookingType), ...(action ? { action } : {}) } as MapPin;
      }).filter(Boolean).slice(0, 8) as MapPin[];
      return pins.length ? { type: 'map', pins } : null;
    }
    case 'timeline': {
      const items: TimelineItem[] = arr(raw.items).map((i) => {
        const title = clamp(i?.title, 80); if (!title) return null;
        const action = cleanAction(i?.action, hasTrip);
        const time = s(i?.time); const t = time && /^\d{1,2}:\d{2}$/.test(time) ? time : undefined;
        return { id: s(i?.id) ?? (action ? slug(title) : undefined), time: t, title, subtitle: clamp(i?.subtitle, 100),
                 symbol: i?.symbol ? resolveSymbol(i.symbol) : undefined, bookingType: bookingType(i?.bookingType),
                 ...(action ? { action } : {}) } as TimelineItem;
      }).filter(Boolean).slice(0, 8) as TimelineItem[];
      return items.length ? { type: 'timeline', title: clamp(raw.title, 40), items } : null;
    }
    case 'budget': {
      const items = arr(raw.items).map((i) => ({ label: clamp(i?.label, 30), amount: num(i?.amount), bookingType: bookingType(i?.bookingType) }))
        .filter((i) => i.label && i.amount !== undefined && i.amount >= 0).slice(0, 8) as { label: string; amount: number; bookingType?: BookingType }[];
      return items.length ? { type: 'budget', currency: clamp(raw.currency, 4), total: clamp(raw.total, 20), items } : null;
    }
    case 'actions': {
      const buttons = arr(raw.buttons).map((b) => cleanAction(b, hasTrip)).filter(Boolean).slice(0, 4) as ViewAction[];
      return buttons.length ? { type: 'actions', buttons } : null;
    }
    default:
      return null;   // unknown type dropped
  }
}

// ---- Category derivation -------------------------------------------------

function deriveCategory(blocks: Block[]): ViewCategory {
  const has = (t: string) => blocks.some((b) => b.type === t);
  if (has('weather')) return 'weather';
  if (has('compare')) return 'compare';
  if (has('budget')) return 'budget';
  if (has('map')) return 'places';
  if (has('timeline')) return 'plan';
  const list = blocks.find((b) => b.type === 'list') as Extract<Block, { type: 'list' }> | undefined;
  if (list?.style === 'checklist') return 'packing';
  if (list) {
    const restaurants = list.rows.filter((r) => r.bookingType === 'restaurant').length;
    if (restaurants >= Math.ceil(list.rows.length / 2)) return 'dining';
    return 'places';
  }
  return 'generic';
}

// ---- The trust boundary --------------------------------------------------

export function sanitizeView(
  raw: any,
  ctx: { trips: Trip[]; touchedTripId?: string },
): { view: View | null; dropped: number } {
  if (!raw || typeof raw !== 'object') return { view: null, dropped: 0 };

  const title = clamp(raw.title, 60);
  if (!title) return { view: null, dropped: 0 };

  // Resolve trip context (needed to know whether add actions survive).
  let tripId = s(raw.trip_id);
  if (tripId && !ctx.trips.some((t) => t.id === tripId)) tripId = undefined;
  if (!tripId) tripId = ctx.touchedTripId;
  const hasTrip = !!tripId;

  const rawBlocks = arr(raw.blocks);
  let dropped = 0;
  const blocks: Block[] = [];
  for (const rb of rawBlocks.slice(0, 12)) {
    const b = cleanBlock(rb, hasTrip);
    if (b) blocks.push(b); else dropped++;
  }
  if (!blocks.length) return { view: null, dropped };

  const trip = tripId ? ctx.trips.find((t) => t.id === tripId) : undefined;
  const accent = typeof raw.accent === 'string' && /^#[0-9a-f]{6}$/i.test(raw.accent) ? raw.accent : undefined;
  // A valid agent-supplied scene wins; otherwise match the trip's landscape
  // (so a view for the Guatemala trip shows the same world as its trip card).
  const scene = SCENES.includes(raw.scene)
    ? raw.scene
    : (trip ? sceneFor(`${trip.destination} ${trip.title}`) : sceneFor(title));
  const eyebrow = clamp(raw.eyebrow, 40) ?? (trip ? trip.destination.toUpperCase().slice(0, 40) : undefined);

  const view: View = {
    v: VIEW_SCHEMA_VERSION,
    id: '', kind: 'view',
    scene, ...(accent ? { accent } : {}),
    title, subtitle: clamp(raw.subtitle, 80), ...(eyebrow ? { eyebrow } : {}),
    ...(tripId ? { tripId } : {}),
    category: deriveCategory(blocks),
    blocks,
    createdAt: 0, expiresAt: 0,
  };

  // Size guard — drop trailing blocks until under 24KB.
  while (blocks.length > 1 && JSON.stringify(view).length > 24 * 1024) {
    blocks.pop(); dropped++;
  }

  return { view, dropped };
}

// ---- Day inference for write-back ---------------------------------------

/** When a suggestion has no explicit day, place it on the trip's soonest
 *  not-yet-past day with the fewest existing bookings. */
export function inferDay(trip: Trip, bookings: Booking[], provided?: string): string {
  const days = dayKeys(trip.startDate, trip.endDate);
  if (!days.length) return trip.startDate;
  if (provided && /^\d{4}-\d{2}-\d{2}$/.test(provided)) {
    // clamp into the trip window
    if (provided < trip.startDate) return trip.startDate;
    if (provided > trip.endDate) return trip.endDate;
    return provided;
  }
  const today = new Date().toISOString().slice(0, 10);
  const candidates = days.filter((d) => d >= today);
  const pool = candidates.length ? candidates : days;
  const count = (d: string) => bookings.filter((b) => b.tripId === trip.id && b.dayKey === d).length;
  return [...pool].sort((a, b) => count(a) - count(b) || a.localeCompare(b))[0];
}

function dayKeys(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}
