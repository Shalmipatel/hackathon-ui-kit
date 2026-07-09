// Public, read-only trip data for the native iMessage extension. The extension
// ships lean — it doesn't carry Firebase auth — so instead of reading RTDB
// directly it fetches the whole trip/booking snapshot from here (the same REST
// path the agent uses). The card payload names WHICH trip to focus; this feeds
// the full itinerary, map coordinates, and budget behind it.
//
// Public path: GET /trips-data (rewritten to /api/trips in vercel.json — a bare
// /api/* path is proxied to the dead OpenClaw host, so it needs its own rewrite).
// Named-export Web handler: Vercel's Node runtime ignores a Response returned
// from a default export (see api/imessage.ts).

import { loadTrips, loadBookings } from '../server/rtdb.js';

export const config = { runtime: 'nodejs' };

export async function GET(): Promise<Response> {
  try {
    const [trips, bookings] = await Promise.all([loadTrips(), loadBookings()]);
    return new Response(JSON.stringify({ trips, bookings }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        // Short cache — the extension wants fresh itinerary but a few seconds
        // of edge caching absorbs bursts (one card tapped repeatedly).
        'cache-control': 'public, max-age=15, s-maxage=15',
        'access-control-allow-origin': '*',
      },
    });
  } catch (err) {
    console.error('[trips-data] load failed', err);
    return new Response(JSON.stringify({ trips: [], bookings: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
    });
  }
}
