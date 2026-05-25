---
name: imessage-card
description: After answering a question whose subject is a single trip or single booking, send a rich-link preview card as a SECOND iMessage by invoking the `photon` CLI tool. Without this skill, OpenClaw collapses the card URL into the prose reply and iMessage never renders it as a rich card.
---

# imessage-card

When your reply has **one clear subject** — a specific trip OR a specific booking — you must follow up your prose answer with a **second iMessage** containing nothing but a Wanderbot preview URL. iMessage only renders a link as a rich card when the message contains nothing but the URL. Inline URLs render as plain blue text and look terrible.

The prose reply goes out as your normal text response. The URL goes out as a **separate tool call** to the `photon` CLI. **Two messages, not one.**

## When this skill fires

Fire whenever the reply has one clear subject:

- "What hotel are we at?" → booking card for that hotel.
- "When's my flight?" → booking card for that flight.
- "What's our next trip?" → trip card for that trip.
- "Tell me about the Switzerland trip." → trip card for that trip.
- "What's the dinner reservation Friday?" → booking card for that restaurant.

**Do NOT fire** when the reply spans multiple things and no one of them is the answer:

- "What are we doing tomorrow?" → prose only, no card. The answer is a list.
- "How's my packing looking?" → prose only.
- "Summarize the trip." → prose only (multiple bookings, not one).

Cap: **one card per turn**. Even if the user asks about three different bookings, send at most one card — the most relevant one.

## The protocol — two messages

### Step 1: Answer in prose

Reply as you normally would, in plain text. No URL anywhere in this message. No markdown — iMessage doesn't render it.

> *Message 1 (your normal text reply):*
> `You're staying at the Marriott Autograph — check-in Sept 12, 3 nights.`

### Step 2: Send the URL as a follow-up iMessage via `photon`

After your prose reply has been emitted, invoke the `photon` CLI as a tool call. The message argument must be **the URL and nothing else** — no leading space, no trailing period, no surrounding emoji, no quotes inside the URL.

```bash
photon send "https://wanderbot-ai.vercel.app/p?title=Marriott%20Autograph&subtitle=Sept%2012%E2%80%9315%20%C2%B7%203%20nights&type=hotel&meta=Tokyo%20trip&href=%2Ftrip%2Ftok2026"
```

(If your installed `photon` invocation differs — e.g. `photon "<msg>"` or `photon --send "<msg>"` — use whatever the locally-installed binary expects. The key is: one CLI call, message body = URL only.)

That second iMessage arrives ~1 second after the prose, Apple's Link Preview daemon scrapes the URL, and iMessage renders it as a rich card with branded image, title, subtitle.

## URL format

```
https://wanderbot-ai.vercel.app/p?title=<TITLE>&subtitle=<SUBTITLE>&type=<TYPE>&meta=<META>&href=<APP_PATH>
```

All values URL-encoded with `encodeURIComponent`. Common substitutions:

- space → `%20`
- em dash `—` → `%E2%80%94`
- en dash `–` → `%E2%80%93`
- middle dot `·` → `%C2%B7`
- arrow `→` → `%E2%86%92`
- `&` inside a value → `%26`
- `/` inside `href` → `%2F`

### Parameters

| Param      | Required | Max | What it is                                                                                          |
|------------|----------|-----|-----------------------------------------------------------------------------------------------------|
| `title`    | yes      | 120 | Big heading. For a trip: destination ("Switzerland"). For a booking: the booking name.              |
| `subtitle` | yes      | 160 | One-line context line under the title.                                                              |
| `type`     | yes      | —   | One of: `trip`, `flight`, `hotel`, `attraction`, `experience`, `event`, `activity`, `restaurant`, `transport`. Drives the card icon and color. |
| `meta`     | no       | 80  | Small footer text on the card image. For a booking card, use the trip name (e.g. `Tokyo trip`). Leave blank for trip cards. |
| `href`     | yes      | —   | In-app path the user lands on when they tap the card. **Must start with `/`**. Use `/trip/<tripId>` for trip cards. For per-booking cards, append `#booking=<bookingId>` so the SPA scrolls to and expands the specific booking — e.g. `/trip/trip-tokyo-2026#booking=bk-trip-tokyo-2026-hotel-20260613-marr987`. |
| `loc`      | no       | 120 | Optional third line under the subtitle, rendered with a location-pin glyph. For **bookings**: the address ("Roppongi, Tokyo"). For **trips**: traveler info ("with Shubh & Mia") or a stats line ("9 days · 4 travelers"). |
| `cost`     | no       | 24  | Optional dark pill rendered in the top-right of the hero. **Pre-format** with the currency symbol — e.g. `$2,200`, `¥18,400`, `€420`. Skip for trip cards unless you have a meaningful total. |
| `cta`      | no       | 48  | Override the right-side footer call-to-action. Defaults to `Open in Wanderbot →`. Use sparingly — e.g. for time-sensitive cards: `Check in now →`. |
| `desc`     | no       | 220 | Override the iMessage preview's subtitle text (defaults to `subtitle`).                             |

### Constructing a CONTEXTUAL title

**The single biggest lever for card quality.** The title should answer the *frame* of the question — not just name the entity. A card that says `Switzerland` when the user asked "what's the plan when we land" is generic; one that says `Day 1 · Switzerland` mirrors the question and feels designed for it.

Reframe the title around what's being asked:

| User question | Lazy title (don't do) | Contextual title (do) |
| ------------- | --------------------- | --------------------- |
| "What's the plan when we land?" | `Switzerland` | `Day 1 · Switzerland` |
| "What are we doing tomorrow?" | `Tokyo` | `Tomorrow · Tokyo` (or `Day 3 · Tokyo`) |
| "What's our next trip?" | `Switzerland` | `Switzerland` ✓ (the entity IS the answer) |
| "When's our return flight?" | `Delta 287` | `Return · Delta 287` |
| "What hotel are we at on the 14th?" | `Marriott Autograph` | `Night of Sept 14 · Marriott Autograph` |
| "Where are we eating Friday?" | `Sushi Saito` | `Friday Dinner · Sushi Saito` |
| "What's our last day in Tokyo?" | `Tokyo` | `Last Day · Tokyo` |
| "What's checkout time at the hotel?" | `Marriott Autograph` | `Checkout · Marriott Autograph` |

Pattern: `<question frame> · <entity name>`. The frame goes first because it's the contextual hook. Use the `·` separator (middle dot, URL-encoded `%C2%B7`) to join.

When the question's frame IS the entity (e.g. "what's our next trip?" → answer is the trip itself), skip the frame and let the entity name be the title.

### Subtitle should add the "what / when / how much" the user didn't ask but will want

The subtitle is where you pack the supporting facts so the card carries real information instead of being a glorified label. For the "Day 1" example: subtitle is `Sat Jun 20 · 4 plans` — gives the date and a quantity, both useful at-a-glance.

Patterns:

- **Day-focused cards** (when the title is `Day N · <Trip>`, `Tomorrow · ...`, etc.): subtitle is `<weekday + date> · <N plans>`. E.g. `Sat Jun 20 · 4 plans`.
- **Range-focused cards** (the whole trip): subtitle is `<date range> · <days> · <travelers>`. E.g. `Jun 19–28 · 9 days · 2 travelers`.
- **Single-booking cards**: see the per-type table below — those subtitle conventions still apply.

### Subtitle conventions

**Trip-overview cards** (`type=trip`):

- `<dates> · <N days>` → `Jun 19–28 · 9 days`
- `<dates> · <N travelers>` → `Jun 19–28 · 4 travelers`
- Or just dates: `Jun 19–28`

**Per-booking cards**:

| Type | Subtitle pattern | Example |
| ---- | ---------------- | ------- |
| `hotel` | `<dates> · <N nights>` | `Sept 12–15 · 3 nights` |
| `flight` | `<flight no.> · <FROM → TO>` | `DL287 · SFO → NRT` |
| `restaurant` | `<neighborhood> · Party of <N>` | `Roppongi · Party of 2` |
| `activity` / `attraction` / `experience` / `event` | `<place> · <date or time>` | `teamLab Planets · Sat 2 PM` |
| `transport` | `<mode> · <FROM → TO>` | `Shinkansen · Tokyo → Kyoto` |

## Examples — the full two-step flow

### Day-plan question (the most common pattern)

> User: "What's the plan when we land in Switzerland?"

**Step 1 — prose reply** (numbered list, mirrors what the card will say):
```
You land Sat Jun 20 at 3:45 PM at ZRH. Plan:

1. Walk around Zürich
2. Lindt Home of Chocolate (buy tickets ahead)
3. Haus Hiltl dinner at 6 PM
4. Sleep at Renaissance Zurich Tower Hotel
```

**Step 2 — photon tool call:**
```bash
photon send "https://wanderbot-ai.vercel.app/p?title=Day%201%20%C2%B7%20Switzerland&subtitle=Sat%20Jun%2020%20%C2%B7%204%20plans&type=trip&loc=Arrive%20ZRH%203%3A45%20PM&meta=Switzerland%20trip&href=%2Ftrip%2Ftrip-zurich-2026"
```

Notice: the title is `Day 1 · Switzerland` (not just `Switzerland`) because the question is about the arrival day. The subtitle is `Sat Jun 20 · 4 plans` — gives the date *and* signals "there's a list of 4 things." The `loc` line surfaces the arrival detail (`Arrive ZRH 3:45 PM`). All three pieces work together to make the card feel like an answer to the specific question.

### Trip question

> User: "What's our next trip?"

**Step 1 — prose reply:**
```
Your next trip is Switzerland, Jun 19–28.
```

**Step 2 — photon tool call:**
```bash
photon send "https://wanderbot-ai.vercel.app/p?title=Switzerland&subtitle=Jun%2019%E2%80%9328%20%C2%B7%209%20days&type=trip&loc=with%20Shubh%20%26%20Mia&href=%2Ftrip%2Ftrip-zurich-2026"
```

### Hotel question

> User: "What hotel are we staying at?"

**Step 1 — prose reply:**
```
You're staying at the Marriott Autograph — check-in Sept 12, 3 nights.
```

**Step 2 — photon tool call:**
```bash
photon send "https://wanderbot-ai.vercel.app/p?title=Marriott%20Autograph&subtitle=Sept%2012%E2%80%9315%20%C2%B7%203%20nights&type=hotel&loc=Roppongi%2C%20Tokyo&cost=%242%2C200&meta=Tokyo%20trip&href=%2Ftrip%2Ftrip-tokyo-2026%23booking%3Dbk-trip-tokyo-2026-hotel-20260613-marr987"
```

### Flight question

> User: "When's my flight?"

**Step 1 — prose reply:**
```
Delta 287 departs SFO 11:25 AM on Sept 12 and lands at Narita 3:40 PM on Sept 13.
```

**Step 2 — photon tool call:**
```bash
photon send "https://wanderbot-ai.vercel.app/p?title=Delta%20287&subtitle=DL287%20%C2%B7%20SFO%20%E2%86%92%20NRT&type=flight&loc=SFO%20Terminal%20I%2C%20Gate%20B14&cost=%241%2C840&meta=Tokyo%20trip&href=%2Ftrip%2Ftrip-tokyo-2026%23booking%3Dbk-trip-tokyo-2026-flight-20260612-ana123"
```

### Restaurant question

> User: "What's the dinner reservation Friday?"

**Step 1 — prose reply:**
```
Sushi Saito Friday 7:30 PM, party of 2.
```

**Step 2 — photon tool call:**
```bash
photon send "https://wanderbot-ai.vercel.app/p?title=Sushi%20Saito&subtitle=Friday%207%3A30%20PM%20%C2%B7%20Party%20of%202&type=restaurant&loc=4-1-15%20Roppongi%2C%20Minato&meta=Tokyo%20trip&href=%2Ftrip%2Ftrip-tokyo-2026%23booking%3Dbk-trip-tokyo-2026-restaurant-20260615-resy42"
```

## Looking up `tripId` and `bookingId`

The `href` always begins with `/trip/<tripId>` (the trip's RTDB key) and — for per-booking cards — appends `#booking=<bookingId>` so the SPA scrolls to and expands the specific booking when the user taps the card. See the [wanderbot-sync skill](wanderbot-sync.md) for the id conventions:

- `tripId` format: `trip-<destination-slug>-<startYear>` (e.g. `trip-tokyo-2026`)
- `bookingId` format: `bk-<tripId>-<type>-<startDateNoDashes>[-<confirmationLowercase>]` (e.g. `bk-trip-tokyo-2026-hotel-20260613-marr987`)

To find the right ids for the trip/booking you're answering about:

1. If you've just read the records from RTDB during the same turn, you already have `booking.tripId` and `booking.id` — use them.
2. Otherwise: `GET https://gen-lang-client-0500673478-default-rtdb.firebaseio.com/wanderbot/trips.json` and `bookings.json`, then match by destination/date/title.

**Hash-encoding gotcha**: the `#` separating tripId from `booking=` must be URL-encoded as `%23` inside the `href` value, because the agent's encoded URL is itself a query-string value. The `=` after `booking` must be `%3D`. So the path piece `#booking=foo` becomes `%23booking%3Dfoo` inside the `href` param. The full `href=` value for a hotel deep-link looks like `href=%2Ftrip%2Ftrip-tokyo-2026%23booking%3Dbk-trip-tokyo-2026-hotel-20260613-marr987`.

If you genuinely can't determine the tripId, set `href=%2F` (root) and still send the card — the user will land on the trip list and the card image still conveys the info visually.

## Hard don'ts

- ❌ **Don't put the URL in the prose reply.** Inline URLs render as plain blue text, not as a card. The URL goes in the `photon` tool call only.
- ❌ **Don't put anything other than the URL in the photon call's message body.** No leading space, no trailing period, no surrounding emoji, no prefix like "Here:". URL only.
- ❌ **Don't use markdown anywhere in either message** — iMessage doesn't render it.
- ❌ **Don't use a domain other than `wanderbot-ai.vercel.app`** (the deployed Wanderbot app). `photon.codes` is the iMessage bridge layer, NOT a card-rendering domain.
- ❌ **Don't send more than one card per turn.** Multiple stacked cards feel like spam in iMessage.
- ❌ **Don't fire the skill when the reply is a list / summary / multi-item answer.** Cards are for single-subject answers only.

## Testing & cache gotcha

Apple's Link Preview daemon caches per-URL **hard**. While iterating on a card's design or text, append a throwaway query param (`&v=2`, `&v=3`, …) to force iMessage to re-scrape. Without that, you'll keep seeing the first version of the card for the same URL forever, even after the underlying card design changes.
