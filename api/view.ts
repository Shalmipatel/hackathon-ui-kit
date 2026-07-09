// Public endpoints for the dynamic-view system.
//   GET  /view?id=vw-…   → { view }        the extension fetches the block tree
//   POST /view           → { ok, added }   Add-to-itinerary write-back
// Rewritten to /api/view in vercel.json (a bare /api/* path is proxied to the
// dead OpenClaw host). Named-export Web handlers (Vercel Node runtime ignores a
// Response returned from a default export — see api/imessage.ts).

import { loadView, patchViewAdded } from '../server/rtdb.js';
import { inferDay, type View, type ActionBooking } from '../server/view.js';
import { Tools } from '../server/tools.js';

export const config = { runtime: 'nodejs' };

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' };

function json(body: unknown, status = 200, cache = 'no-store'): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': cache, ...CORS },
  });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: Request): Promise<Response> {
  const id = new URL(req.url).searchParams.get('id') ?? '';
  const view = await loadView(id);
  return view
    ? json({ view }, 200, 'public, max-age=60, s-maxage=300')
    : json({ view: null }, 404);
}

// ---- write-back ----------------------------------------------------------

interface Actionable { blockId: string; itemId: string; booking: ActionBooking; }

/** Every add_booking-actionable item across the view's blocks. */
function gatherActionables(view: View): Actionable[] {
  const out: Actionable[] = [];
  for (const b of view.blocks) {
    const bid = ('id' in b && b.id) ? b.id : b.type;
    const push = (itemId: string | undefined, action: { type: string; booking?: ActionBooking } | undefined) => {
      if (action?.type === 'add_booking' && action.booking && itemId) out.push({ blockId: bid, itemId, booking: action.booking });
    };
    if (b.type === 'list') b.rows.forEach((r) => push(r.id, r.action));
    else if (b.type === 'compare') b.columns.forEach((c) => push(c.id, c.action));
    else if (b.type === 'map') b.pins.forEach((p) => push(p.id, p.action));
    else if (b.type === 'timeline') b.items.forEach((i) => push(i.id, i.action));
  }
  return out;
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const safeKey = (s: string) => s.replace(/[.#$/[\]]/g, '_');

function dayLabel(day: string): string {
  const d = new Date(day + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export async function POST(req: Request): Promise<Response> {
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const viewId = typeof body.viewId === 'string' ? body.viewId : '';
  const kind = body.kind === 'add_all' ? 'add_all' : 'add_booking';
  const blockId = typeof body.blockId === 'string' ? body.blockId : undefined;
  const itemId = typeof body.itemId === 'string' ? body.itemId : undefined;

  // Re-read the STORED view — never trust a client-supplied booking (tamper-safe).
  const view = await loadView(viewId);
  if (!view) return json({ ok: false, error: 'view_expired' }, 404);
  const tripId = view.tripId;
  if (!tripId) return json({ ok: false, error: 'no_trip' }, 409);

  const all = gatherActionables(view);
  const targets = kind === 'add_all'
    ? all.filter((a) => !blockId || a.blockId === blockId)
    : all.filter((a) => a.itemId === itemId && (!blockId || a.blockId === blockId));
  if (!targets.length) return json({ ok: false, error: 'not_found' }, 404);

  const tools = new Tools();
  await tools.load();
  const trip = tools.trips.find((t) => t.id === tripId);
  if (!trip) return json({ ok: false, error: 'no_trip' }, 409);

  const added: Array<{ itemId: string; bookingId: string; day: string; dayLabel: string; alreadyAdded?: boolean }> = [];
  for (const t of targets) {
    const key = safeKey(t.itemId);

    // Idempotency 1: existing marker on the stored view.
    const marker = view.added?.[key];
    if (marker) {
      const existing = tools.bookings.find((b) => b.id === marker.bookingId);
      const day = existing?.dayKey ?? inferDay(trip, tools.bookings, t.booking.day);
      added.push({ itemId: t.itemId, bookingId: marker.bookingId, day, dayLabel: dayLabel(day), alreadyAdded: true });
      continue;
    }

    const day = inferDay(trip, tools.bookings, t.booking.day);

    // Idempotency 2: same (title, day, trip) already on the itinerary.
    const dup = tools.bookings.find((b) => b.tripId === tripId && b.dayKey === day && normalize(b.title) === normalize(t.booking.title));
    if (dup) {
      await patchViewAdded(viewId, key, { bookingId: dup.id, at: Date.now() });
      added.push({ itemId: t.itemId, bookingId: dup.id, day, dayLabel: dayLabel(day), alreadyAdded: true });
      continue;
    }

    // Write via the exact same path the agent uses.
    const res = await tools.execute('add_booking', { trip_id: tripId, ...t.booking, day });
    const m = /booking id (bk-[0-9a-f]+)/.exec(res);
    if (!m) return json({ ok: false, error: 'sync_failed', added }, 502);
    const bookingId = m[1];
    await patchViewAdded(viewId, key, { bookingId, at: Date.now() });
    added.push({ itemId: t.itemId, bookingId, day, dayLabel: dayLabel(day) });
  }

  return json({ ok: true, added }, 200);
}
