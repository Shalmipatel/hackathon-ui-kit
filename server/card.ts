// Build a rich native iMessage card for a single trip or booking. The card is
// delivered via Spectrum's customizedMiniApp() targeting our own iMessage
// extension (com.wanderbot.Wanderbot.Messages), which renders the declarative
// payload natively. The payload rides in the URL as a base64url `p=` query item
// (the extension decodes it); the URL also carries OG params so /p renders a
// fallback card where the extension isn't installed.

import type { Trip, Booking, Place } from '../src/features/travel/types';
import type { Subject } from './tools';

const SITE = process.env.CARD_SITE ?? 'https://wanderbot-ai.vercel.app';

export const EXTENSION_BUNDLE_ID = 'com.wanderbot.Wanderbot.Messages';
export const TEAM_ID = process.env.APPLE_TEAM_ID ?? 'QN7REDCUD3';

const TYPE_ACCENT: Record<string, string> = {
  trip: '#FEEB29', flight: '#8FB7E8', hotel: '#FEEB29',
  restaurant: '#F39C6B', attraction: '#C7A8E8', experience: '#C7A8E8',
  event: '#C7A8E8', activity: '#7CC4A0', transport: '#7CC4A0',
};

interface CardPayload {
  type: string;
  title: string;
  subtitle?: string;
  /** Small top label on the image card (destination / place). */
  eyebrow?: string;
  lines?: string[];
  accent?: string;
  href?: string;
  /** Trip the extension should load full itinerary/map/budget for. */
  tripId?: string;
  /** For a booking card, the specific booking to highlight in the viewer. */
  bookingId?: string;
  /** Landscape scene for the /og hero (mirrors the extension's classifier). */
  scene?: string;
}

/** What the webhook needs to call customizedMiniApp(). */
export interface CardSpec {
  appName: string;
  extensionBundleId: string;
  teamId: string;
  url: string;
  caption: string;
  subcaption?: string;
  /** Rendered PNG card (1200x630) for the iMessage bubble — without an image
   *  the bubble renders blank. The webhook fetches these bytes and passes them
   *  as the customizedMiniApp layout `image`. */
  imageUrl: string;
}

function base64url(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Landscape scene for a destination — mirrors WBScene.classify in the iOS
 *  extension (NightSkyScene.swift) so the chat-bubble PNG and the native
 *  extension hero always show the same world. Order matters. */
export function sceneFor(text: string): string {
  const s = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const hit = (words: string[]) => words.some((w) => s.includes(w));

  if (hit(['beach', 'island', 'coast', 'maui', 'oahu', 'kauai', 'hawaii', 'honolulu',
           'bali', 'cancun', 'tulum', 'cabo', 'playa', 'miami', 'caribbean', 'fiji',
           'phuket', 'malibu', 'san diego', 'amalfi', 'santorini', 'riviera'])) return 'coast';
  if (hit(['aurora', 'northern lights', 'iceland', 'reykjavik', 'tromso', 'alaska',
           'fairbanks', 'lofoten', 'greenland'])) return 'aurora';
  if (hit(['snow', 'ski ', 'skiing', 'aspen', 'whistler', 'vail', 'lapland', 'hokkaido',
           'niseko', 'antarctica', 'arctic', 'chamonix'])) return 'snow';
  if (hit(['desert', 'sahara', 'dubai', 'abu dhabi', 'phoenix', 'scottsdale', 'sedona',
           'arizona', 'moab', 'joshua tree', 'palm springs', 'marrakech', 'morocco',
           'atacama', 'mojave', 'death valley'])) return 'desert';
  if (hit(['forest', 'jungle', 'rainforest', 'redwood', 'sequoia', 'yosemite', 'smoky',
           'olympic national', 'costa rica', 'amazon', 'black forest'])) return 'forest';
  if (hit(['river', 'lake', 'laguna', 'lagoon', 'venice', 'amsterdam', 'bangkok',
           'atitlan', 'como', 'bled', 'mekong', 'danube'])) return 'river';
  if (hit(['new york', 'nyc', 'manhattan', 'tokyo', 'london', 'paris', 'chicago',
           'san francisco', 'seattle', 'berlin', 'barcelona', 'madrid', 'rome', 'milan',
           'singapore', 'hong kong', 'seoul', 'toronto', 'boston', 'austin',
           'las vegas', 'vegas', 'city'])) return 'city';
  return 'mountain';
}

function fmtRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  const mo = (d: Date) => d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const sameMonth = s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear();
  return sameMonth
    ? `${mo(s)} ${s.getUTCDate()}–${e.getUTCDate()}, ${e.getUTCFullYear()}`
    : `${mo(s)} ${s.getUTCDate()} – ${mo(e)} ${e.getUTCDate()}, ${e.getUTCFullYear()}`;
}

/** Pick the single most relevant subject the agent touched, or null. */
export function pickSubject(touched: Subject[]): Subject | null {
  const bookings = touched.filter((t) => t.kind === 'booking');
  if (bookings.length === 1) return bookings[0];
  const trips = touched.filter((t) => t.kind === 'trip');
  const uniqueTrips = new Map(trips.map((t) => [t.trip!.id, t]));
  if (bookings.length === 0 && uniqueTrips.size === 1) return [...uniqueTrips.values()][0];
  return null;
}

function payloadFor(subject: Subject): CardPayload | null {
  if (subject.kind === 'trip' && subject.trip) {
    const t = subject.trip;
    return {
      type: 'trip',
      title: t.title,
      subtitle: `${fmtRange(t.startDate, t.endDate)} · ${t.destination}`,
      eyebrow: t.destination,
      lines: t.summary ? [t.summary] : undefined,
      accent: t.color || TYPE_ACCENT.trip,
      href: `/trip/${t.id}`,
      tripId: t.id,
      scene: sceneFor(`${t.destination} ${t.title}`),
    };
  }
  if (subject.kind === 'booking' && subject.booking) {
    const b = subject.booking;
    const p = (b as { place?: Place }).place ?? (b as { to?: Place }).to;
    const time = /T(\d{2}:\d{2})/.exec(b.start ?? '')?.[1];
    const lines = [
      p?.name ? `📍 ${p.name}` : '',
      b.provider ? `${b.provider}` : '',
      subject.trip ? `Part of ${subject.trip.title}` : '',
    ].filter(Boolean);
    return {
      type: b.type,
      title: b.title,
      subtitle: [b.dayKey, time].filter(Boolean).join(' · '),
      eyebrow: p?.name ?? subject.trip?.title,
      lines: lines.length ? lines : undefined,
      accent: TYPE_ACCENT[b.type] ?? '#7CC4A0',
      href: `/trip/${b.tripId}`,
      tripId: b.tripId,
      bookingId: b.id,
      scene: sceneFor(subject.trip
        ? `${subject.trip.destination} ${subject.trip.title}`
        : `${p?.name ?? ''} ${b.title}`),
    };
  }
  return null;
}

export function cardFor(subject: Subject): CardSpec | null {
  const payload = payloadFor(subject);
  if (!payload) return null;

  // URL: OG params for the non-extension fallback + `p` for the native card.
  const q = new URLSearchParams();
  q.set('title', payload.title);
  if (payload.subtitle) q.set('subtitle', payload.subtitle);
  q.set('type', payload.type);
  if (payload.href) q.set('href', payload.href);
  q.set('p', base64url(JSON.stringify(payload)));

  // Same params as /p's og:image, built directly against /og — the rendered
  // 1200x630 PNG the iMessage bubble shows (a customized-mini-app layout with
  // no `image` renders as a blank bubble).
  const og = new URLSearchParams();
  og.set('title', payload.title);
  if (payload.subtitle) og.set('subtitle', payload.subtitle);
  if (payload.eyebrow) og.set('eyebrow', payload.eyebrow);
  og.set('type', payload.type);
  if (payload.scene) og.set('scene', payload.scene);

  return {
    appName: 'Wanderbot',
    extensionBundleId: EXTENSION_BUNDLE_ID,
    teamId: TEAM_ID,
    url: `${SITE}/p?${q.toString()}`,
    caption: payload.title,
    subcaption: payload.subtitle,
    imageUrl: `${SITE}/og?${og.toString()}`,
  };
}
