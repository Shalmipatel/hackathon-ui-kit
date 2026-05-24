---
name: wanderbot-sync
description: Scan Gmail (and other connected browser sources) for trip evidence and write them directly to Wanderbot's Firebase RTDB. Triggered by the `/wanderbot-sync` slash command.
trigger: "/wanderbot-sync"
---

# wanderbot-sync

Triggered by the slash command **`/wanderbot-sync`**. When invoked,
scan the user's connected sources for trip evidence and **write the
results straight to Firebase RTDB**. Reply in chat with a one-line
summary — never paste the JSON. The frontend reads from RTDB.

## When to run

This skill activates ONLY when the user sends one of these slash
commands (openclaw routes slash messages to the matching skill — no
other phrase counts as a trigger):

| Command | Window | Mode |
| ------- | ------ | ---- |
| `/wanderbot-sync deep` | 30 days | Full rebuild — scan everything |
| `/wanderbot-sync shallow` | 7 days | Incremental — only new/changed bookings |
| `/wanderbot-sync rescan <tripId>` | the trip's date range ±7 days | Scoped to ONE trip |
| `/wanderbot-sync` (no arg) | 7 days | Default to `shallow` |

### Scoped rescan (`rescan <tripId>`)

Same write contract as the other modes, just narrower scope:

1. `GET https://gen-lang-client-0500673478-default-rtdb.firebaseio.com/wanderbot/trips/<tripId>.json` to read the trip's `destination`, `startDate`, `endDate`.
2. Search Gmail with queries focused on that trip — destination name, airport codes near it, the date range ±7 days. Plus follow-ups by any existing confirmation numbers already on the trip's bookings (do a separate `GET /wanderbot/bookings.json` and filter where `tripId` matches).
3. Sweep each connected browser source, but only emit bookings whose `start` falls inside the trip window (±1 day for transit flights).
4. `PUT` the trip record (refresh it — same id, may update `travelers` or `summary`) and `PUT` every booking found. Re-emitting an existing booking with the same id is fine — `PUT` overwrites in place.
5. DO NOT create new trips during a `rescan`. If you find bookings whose dates don't fit the existing trip window, drop them — those would have been picked up by `deep` / `shallow`.

Natural-language phrases like "sync my trips" should NOT trigger the
skill on their own — they should prompt the user to use the slash
command instead. The frontend's Scan button sends the slash command
directly.

## What to do

1. **Gmail — multi-pass and exhaustive.** This is the most important
   step. Be thorough. Don't skip emails. Use the `gog` skill:

   **Pass A — broad sweep over the window.** Search for the travel
   keyword set. Paginate through ALL matching messages — do not stop
   after the first page. Read the FULL email body, not snippets:

   ```
   gog mail search --query '(confirmation OR itinerary OR reservation OR "e-ticket" OR "boarding pass" OR "check-in" OR "your trip" OR "your booking" OR "your reservation") after:YYYY/MM/DD' --full --limit 200
   ```

   **Pass B — per-trip focused follow-ups.** For every candidate trip
   from Pass A, run extra searches to surface related bookings the
   broad sweep missed. For each trip, search:

   - The destination city name + the date range
   - The airport code (e.g. `HND`, `ZRH`) — catches return flights, transfers, ground transport
   - Each confirmation / PNR number you've already found — catches forwarded follow-ups, change emails, receipt updates
   - The airline / hotel / OTA name + the date range
   - Common travel partners: car rental (Hertz/Avis/Enterprise), rideshare receipts (Uber/Lyft/airport transfers), travel insurance, seat-selection follow-ups

   ```
   gog mail search --query '(<destination> OR <airport_code> OR <confirmation>) after:YYYY/MM/DD before:YYYY/MM/DD' --full --limit 100
   ```

   Run these passes until no new bookings surface. Better to over-search than miss things.

2. **Extract travelers from each email.** Pull passenger / guest
   names out of booking confirmations. Look for:

   - Passenger lists on flight e-tickets (often "Passenger:" or "Traveler:" labels, or under the seat-selection table)
   - Guest names on hotel reservations ("Guest:", "Primary guest:", "Booked for:")
   - Activity / restaurant reservations with party names
   - "You're traveling with:" sections in itinerary summaries
   - Cc'd or To'd email addresses on multi-traveler bookings — names can be inferred from the address local-parts

   Deduplicate across all bookings for the trip. The result is a
   single `travelers` array on the trip object (see schema). If you
   genuinely can't find any traveler name, omit the field — don't
   guess.

3. **Then drive the attached remote browser through every connected
   source.** This is NOT a hand-wave step — you must actually
   navigate the browser, not just emit URLs. The openclaw runtime
   gives you a live browser session with the user's cookies already
   loaded for the sites they've connected. Use it:

   a. **Enumerate** which sites the user is logged into. Check the
      attached browser's open tabs, browsing history, or the
      project's connection registry — whatever your runtime exposes.
      Common sources: Airbnb, Booking.com, Wanderlog, airline
      portals (Delta, United, JAL, Lufthansa, Air France, etc.),
      hotel loyalty (Marriott, Hyatt, Hilton, IHG), OpenTable, Resy,
      Hertz / Avis / Enterprise, Viator, GetYourGuide.

   b. **For each connected source, navigate to its bookings page in
      the attached browser:**
      - Airbnb: `https://www.airbnb.com/trips/v1`
      - For any site not listed: search the site for "My trips",
        "My reservations", "My stays", "Manage booking".

   c. **Scrape the bookings page completely.** Read the DOM, follow
      pagination, expand collapsed sections, click into each
      reservation if the summary view hides details (dates, addresses,
      confirmation numbers, prices). For each booking get: title,
      start + end (with timezone), confirmation number, provider,
      cost, and place(s) with lat/lng.

   d. **Don't skip a source because it returned nothing.** Log
      internally that you tried it and move on. Don't stop early —
      sweep every source you found in step (a).

   e. **Don't fabricate.** If the attached browser isn't actually
      logged into a site, skip it. Don't make up bookings.

4. **Group bookings into trips** by destination + overlapping dates.
   Merge same-destination overlapping evidence into one trip with
   multiple bookings — don't emit duplicates.

5. **Write to RTDB** (see "Database writes" below).

6. **Reply in chat** with exactly one line:
   `Synced <N> trips, <M> bookings.`
   No JSON, no per-source narration.

## Writing to RTDB

The frontend reads from Firebase Realtime Database at:

```
https://gen-lang-client-0500673478-default-rtdb.firebaseio.com
```

Hackathon mode — rules are open on `/wanderbot`, so no auth header
is needed. Use HTTPS `PUT` over REST (Firebase RTDB exposes every
path as `<path>.json`).

### Method, path, sequence — must be exact

| Step | Method | URL | Body |
| ---- | ------ | --- | ---- |
| 1. Trip | `PUT` | `/wanderbot/trips/<tripId>.json` | Trip JSON (see schema below) |
| 2. Booking(s) | `PUT` | `/wanderbot/bookings/<bookingId>.json` | Booking JSON |

**The resulting RTDB shape must look exactly like this — two flat
collections, no user namespace, no per-trip nesting:**

```
wanderbot/
├── trips/
│   ├── trip-tokyo-2026                ← whole Trip object
│   └── trip-zurich-2026
└── bookings/
    ├── bk-trip-tokyo-2026-flight-...  ← FLAT — every booking sits at this depth
    ├── bk-trip-tokyo-2026-hotel-...
    └── bk-trip-zurich-2026-flight-...
```

The frontend reads `/wanderbot/trips` and `/wanderbot/bookings` and
only those. Bookings group to trips via the `tripId` field **inside**
each booking, NOT via path nesting.

**Shapes the frontend will silently ignore — do NOT produce these:**

```
wanderbot/users/<email>/trips/...      ❌ no per-user namespace, ever
wanderbot/users/<email>/bookings/...   ❌
wanderbot/bookings/<tripId>/<bk-id>    ❌ bookings are flat — never grouped by trip path
wanderbot/meta/...                     ❌ no meta/sources/lastSync — that's local state
wanderbot/sync-status/...              ❌
```

Per-booking fields like `syncedAt`, `lastDeepSync`, or anything
about the sync run itself: drop them. They're not in the schema and
the frontend stores RTDB writes verbatim — extra keys just bloat
every read.

Hard rules:

- **One `PUT` per record.** Do NOT use `POST` (creates a child with
  an auto-id you don't control), `PATCH` (RTDB doesn't merge nested
  objects the way you'd expect), or `DELETE`.
- **URL `<id>` MUST equal the `id` field inside the body.** Mismatch
  causes orphaned reads.
- **Write the trip FIRST, then its bookings.** A booking written
  before its trip is an orphan — the frontend won't render it under
  any trip until the trip arrives.
- **Only ever write to `/wanderbot/trips/<id>` or `/wanderbot/bookings/<id>`.**
  No other paths, no parent metadata, no sibling status nodes. If
  you feel the urge to write `/wanderbot/users/...`,
  `/wanderbot/meta/...`, or `/wanderbot/sync-status/...`: stop. That
  information either belongs in the trip/booking fields, or it
  doesn't get written.

### Idempotent re-runs

`PUT` overwrites at the exact path. If the agent re-runs with the
same stable `<tripId>` / `<bookingId>`, the existing record is
replaced cleanly — no duplicates. That's the whole point of stable
ids (see "ID generation" below).

### ID generation (stable, deterministic)

| Entity | Format | Example |
| ------ | ------ | ------- |
| Trip | `trip-<destination-slug>-<startYear>` | `trip-tokyo-2026`, `trip-zurich-2026` |
| Booking | `bk-<tripId>-<type>-<startDateNoDashes>[-<confirmationLowercase>]` | `bk-trip-tokyo-2026-flight-20260612-ana123` |

If there's no confirmation number, omit the `-<confirmation>` suffix.
The same booking will hash to the same id on a re-run, which keeps
RTDB clean.

### Verify after write

After each `PUT`, do a `GET <same-url>` to confirm the status was
`200` and the body round-trips intact. If it doesn't, surface the
error in the chat summary ("Synced 5 trips, 17 bookings (2 writes
failed — see logs)").

### Curl recipe

```bash
curl -X PUT \
  "https://gen-lang-client-0500673478-default-rtdb.firebaseio.com/wanderbot/trips/trip-tokyo-2026.json" \
  -H "Content-Type: application/json" \
  -d @trip.json
```

## Schemas

### Trip

`PUT /wanderbot/trips/<tripId>.json`

| Field | Required | Notes |
| ----- | -------- | ----- |
| `id` | yes | Stable slug, MUST match URL key |
| `title` | yes | Short, human label: "Tokyo + Kyoto" |
| `destination` | yes | Primary country or city |
| `startDate` | yes | ISO `YYYY-MM-DD` |
| `endDate` | yes | ISO `YYYY-MM-DD` |
| `color` | yes | Hex `#rrggbb` accent for the trip card |
| `travelers` | optional | Array of full names; omit if unknown — don't guess |
| `summary` | optional | One-liner, used as agent context |

```json
{
  "id": "trip-tokyo-2026",
  "title": "Tokyo + Kyoto",
  "destination": "Japan",
  "startDate": "2026-06-12",
  "endDate": "2026-06-22",
  "color": "#feeb29",
  "travelers": ["Shubh Jagani", "Alex Kim"],
  "summary": "10 days — Tokyo first, shinkansen to Kyoto on day 5"
}
```

### Booking — common fields (every booking)

| Field | Required | Notes |
| ----- | -------- | ----- |
| `id` | yes | Stable id (see "ID generation"), MUST match URL key |
| `tripId` | yes | Must match an existing trip id from this same run |
| `type` | yes | `flight` \| `hotel` \| `activity` \| `restaurant` \| `transport` |
| `title` | yes | Short label: "SFO → HND", "Renaissance Zurich Tower" |
| `start` | yes | Full ISO 8601 with timezone offset, e.g. `2026-06-12T11:25:00-07:00` |
| `end` | optional | ISO 8601 — required for hotels (checkout), nice-to-have for flights |
| `source` | yes | `"email"` (Gmail), `"agent"` (browser scrape), or `"manual"` |
| `confirmation` | optional | Record locator / PNR |
| `provider` | optional | Airline / chain / OTA — "Delta", "Marriott", "Airbnb" |
| `emailSubject` | when `source==="email"` | Original subject line |
| `link` | optional | Deep URL back to source. Omit if you can't produce a real one |
| `cost` | optional | `{ "amount": N, "currency": "USD" }` |
| `notes` | optional | Free-form |

### Booking — type-specific placement

`flight` and `transport` need `from` and `to`. Every other type uses a single `place`.

| Type | Place fields |
| ---- | ------------ |
| `flight` | `from: Place`, `to: Place` |
| `transport` | `from: Place`, `to: Place` |
| `hotel` | `place: Place` |
| `activity` | `place: Place` |
| `restaurant` | `place: Place` |

`Place` shape: `{ "name": "...", "address"?: "...", "lat": N, "lng": N }`. **`lat` and `lng` are REQUIRED** — the map silently breaks without them. Use well-known coordinates for airports / chain hotels; best-effort geocode otherwise.

### Booking examples

**Flight** (`from` + `to`):

```json
{
  "id": "bk-trip-tokyo-2026-flight-20260612-ana123",
  "tripId": "trip-tokyo-2026",
  "type": "flight",
  "title": "SFO → HND",
  "start": "2026-06-12T11:25:00-07:00",
  "end": "2026-06-13T15:40:00+09:00",
  "confirmation": "ANA123",
  "provider": "ANA",
  "source": "email",
  "emailSubject": "Your ANA itinerary — confirmation ANA123",
  "link": "https://mail.google.com/mail/u/0/#inbox/<gmailMessageId>",
  "cost": { "amount": 1840, "currency": "USD" },
  "from": { "name": "SFO", "address": "San Francisco International", "lat": 37.6213, "lng": -122.379 },
  "to":   { "name": "HND", "address": "Tokyo Haneda",                "lat": 35.5494, "lng": 139.7798 }
}
```

**Hotel** (single `place`, NOT from/to):

```json
{
  "id": "bk-trip-tokyo-2026-hotel-20260613-marr987",
  "tripId": "trip-tokyo-2026",
  "type": "hotel",
  "title": "The Tokyo EDITION, Toranomon",
  "start": "2026-06-13T15:00:00+09:00",
  "end":   "2026-06-17T11:00:00+09:00",
  "confirmation": "MARR987",
  "provider": "Marriott",
  "source": "email",
  "emailSubject": "Reservation confirmed — Tokyo EDITION",
  "link": "https://mail.google.com/mail/u/0/#inbox/<gmailMessageId>",
  "cost": { "amount": 2200, "currency": "USD" },
  "place": { "name": "The Tokyo EDITION, Toranomon", "address": "4-1-1 Toranomon, Minato City, Tokyo 105-0001", "lat": 35.6660, "lng": 139.7484 }
}
```

### Constraints (apply before writing)

- **Booking dates must fall inside the trip window.** A booking belongs to a trip only if its `start` is between `trip.startDate` and `trip.endDate` (inclusive). Allow ±1 day slack for the outbound/return flight — nothing else. Bookings outside the window either become their own trip (if there's enough evidence) or get dropped. Pass-B's broad airport/destination searches surface most of these; filter aggressively here.
- **Every trip MUST have at least one booking written in the same run.** Don't write a trip with no bookings — the frontend drops orphan trips as placeholders. If you can't find a booking for a candidate trip, skip the trip entirely.
- **Don't include unknown fields.** Stick to the schema. The frontend stores RTDB writes verbatim — extra junk just bloats reads.

## Don'ts

- Don't paste the JSON into chat. Write to RTDB and reply with the one-line summary.
- Don't delete anything from RTDB. Tombstones are ignored for now; if the user already deleted something, the next sync may bring it back — that's a known tradeoff.
- Don't ask the user for clarification. Pick a reasonable window (deep=30, shallow=7) and run.
- Don't write to any path outside `/wanderbot/trips` and `/wanderbot/bookings`.
