// Spectrum webhook — the iMessage front door, now powered by xAI directly
// (grok-4.5 + trip tools) instead of OpenClaw. Inbound iMessages arrive here;
// we run the agent, reply in prose, and send a rich tappable app card when the
// answer has a single clear subject (a trip or a booking).
//
// Public path: POST /imessage (rewritten to /api/imessage in vercel.json).
// Register that URL as the project's webhook in the Photon dashboard.
//
// Env: SPECTRUM_PROJECT_ID, SPECTRUM_PROJECT_SECRET, SPECTRUM_WEBHOOK_SECRET,
//      XAI_API_KEY, FIREBASE_DATABASE_URL.

import { Spectrum } from 'spectrum-ts';
import { imessage, customizedMiniApp } from 'spectrum-ts/providers/imessage';
import { waitUntil } from '@vercel/functions';
import { runAgent } from '../server/agent.js';
import { pickSubject, cardFor } from '../server/card.js';

export const config = { runtime: 'nodejs', maxDuration: 60 };

// Deduplicate on message id — webhooks can redeliver.
const seen = new Set<string>();

let appPromise: ReturnType<typeof Spectrum> | null = null;
function getApp() {
  if (!appPromise) {
    appPromise = Spectrum({
      projectId: process.env.SPECTRUM_PROJECT_ID!,
      projectSecret: process.env.SPECTRUM_PROJECT_SECRET!,
      webhookSecret: process.env.SPECTRUM_WEBHOOK_SECRET,
      providers: [imessage.config()],
    });
  }
  return appPromise;
}

// Vercel's Node runtime uses the Web fetch-style API when you export named
// HTTP-method functions (GET/POST). A default export is treated as the legacy
// (req, res) => void handler and any returned Response is ignored — which hangs
// the request. Spectrum's app.webhook() speaks Web Request/Response, so we use
// the named-export form.
export function GET(): Response {
  return new Response('Method Not Allowed', { status: 405 });
}

export async function POST(req: Request): Promise<Response> {
  const app = await getApp();

  // Spectrum invokes the handler fire-and-forget (docs: "runs after the HTTP
  // response is sent"). On Vercel the instance FREEZES the moment we return, so
  // we capture the handler's completion and hand it to waitUntil() to keep the
  // function alive until the reply is delivered — the documented async model.
  let settle: () => void = () => {};
  const handlerDone = new Promise<void>((resolve) => { settle = resolve; });

  const result = await app.webhook(req, async (space, message) => {
    try {
      if (message.content.type !== 'text') return;
      if (seen.has(message.id)) return;
      seen.add(message.id);

      const text = message.content.text?.trim();
      if (!text) return;

      try {
        await space.startTyping?.();
        const { reply, tools } = await runAgent(text);
        await space.send(reply);

        const subject = pickSubject(tools.touched);
        const card = subject ? cardFor(subject) : null;
        if (card) {
          try {
            // The customized-mini-app layout renders blank without an `image`
            // — fetch the rendered 1200x630 PNG card and attach the bytes.
            let image: Uint8Array | undefined;
            try {
              const imgRes = await fetch(card.imageUrl);
              if (imgRes.ok) image = new Uint8Array(await imgRes.arrayBuffer());
            } catch (imgErr) {
              console.error('[imessage] card image fetch failed (non-fatal)', imgErr);
            }
            // Spectrum's layout schema requires image + imageTitle together
            // (and rejects imageSubtitle without image) — omitting imageTitle
            // here throws inside space.send() and silently drops the card
            // (caught below as "non-fatal"). Mirror caption/subcaption onto
            // imageTitle/imageSubtitle only when we actually have image bytes.
            await space.send(
              customizedMiniApp({
                appName: card.appName,
                extensionBundleId: card.extensionBundleId,
                teamId: card.teamId,
                url: card.url,
                layout: image
                  ? {
                      caption: card.caption,
                      subcaption: card.subcaption,
                      image,
                      imageTitle: card.caption,
                      imageSubtitle: card.subcaption,
                    }
                  : { caption: card.caption, subcaption: card.subcaption },
              }),
            );
          } catch (cardErr) {
            // A card failure must not sink the whole reply — prose already went out.
            console.error('[imessage] card send failed (non-fatal)', cardErr);
          }
        }
      } catch (err) {
        console.error('[imessage] agent error', err);
        try { await space.send("Sorry — I hit a snag pulling that up. Try again in a moment."); }
        catch (e) { console.error('[imessage] fallback send failed', e); }
      } finally {
        await space.stopTyping?.();
      }
    } finally {
      settle();
    }
  });

  // Ack fast (documented model); the reply is delivered async under waitUntil.
  waitUntil(handlerDone);
  return new Response(result.body, { status: result.status, headers: result.headers });
}
