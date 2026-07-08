# iMessage (Spectrum) integration

The iMessage front door, migrated off OpenClaw to call **xAI (grok-4.5) directly**.

## Flow

`POST /imessage` (Vercel serverless, rewritten to `/api/imessage`) is the Spectrum
webhook. On an inbound iMessage it:

1. Runs the agent (`server/agent.ts`) — grok-4.5 via the Responses API with the
   trip tools (`server/tools.ts`, RTDB-backed) plus hosted web/x search.
2. Replies with `space.send(prose)`.
3. If the answer has a single clear subject (one trip or one booking), sends a
   tappable **iMessage app card** via `space.send(app(cardUrl))`, where `cardUrl`
   is the existing rich `/p` Open Graph card.

## Required Vercel env vars

| Var | Purpose |
|---|---|
| `SPECTRUM_PROJECT_ID` | Photon project id |
| `SPECTRUM_PROJECT_SECRET` | Photon project secret |
| `SPECTRUM_WEBHOOK_SECRET` | HMAC secret from the Photon dashboard (webhook verification) |
| `XAI_API_KEY` | xAI key (code falls back to the bundled key if unset) |
| `FIREBASE_DATABASE_URL` | RTDB URL (has a default) |

## Remaining setup (Photon dashboard — manual)

1. In the Photon/Spectrum dashboard, set the project's **webhook URL** to
   `https://wanderbot-ai.vercel.app/imessage` and copy its signing secret into
   `SPECTRUM_WEBHOOK_SECRET`.
2. Connect the iMessage number/relay (cloud mode) per the provider docs.

The `app()` card renders through Spectrum's Apple-approved launcher — no custom
iMessage extension needed (unlike `customizedMiniApp()`).
