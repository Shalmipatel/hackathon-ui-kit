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

  // Spectrum invokes the handler fire-and-forget — processWebhookEvent() in
  // @spectrum-ts/core calls deliverWebhookMessages(...) WITHOUT awaiting it and
  // returns immediately. On a long-lived server the handler finishes in the
  // background; on a Vercel serverless function the instance FREEZES the moment
  // we return the Response, killing the in-flight agent before it can
  // space.send() the reply (Photon then surfaces its own "I hit an error").
  // So we capture the handler's completion and hand it to waitUntil(), which
  // keeps the function warm until the reply is delivered — while still acking
  // the webhook immediately.
  let settle: () => void = () => {};
  const handlerDone = new Promise<void>((resolve) => { settle = resolve; });

  const result = await app.webhook(req, async (space, message) => {
    try {
      console.log('[imessage] inbound', JSON.stringify({
        id: message.id,
        contentType: message.content?.type,
        textPreview: (message.content as { text?: string })?.text?.slice(0, 80),
      }));

      if (message.content.type !== 'text') {
        console.log('[imessage] skip: non-text content', message.content?.type);
        return;
      }
      if (seen.has(message.id)) {
        console.log('[imessage] skip: duplicate', message.id);
        return;
      }
      seen.add(message.id);

      const text = message.content.text?.trim();
      if (!text) {
        console.log('[imessage] skip: empty text');
        return;
      }

      try {
        await space.startTyping?.();
        console.log('[imessage] running agent for:', text.slice(0, 80));
        const { reply, tools } = await runAgent(text);
        console.log('[imessage] agent reply len', reply.length, 'preview:', reply.slice(0, 120));

        try {
          await space.send(reply);
          console.log('[imessage] reply sent OK');
        } catch (sendErr) {
          console.error('[imessage] reply send FAILED', sendErr);
          throw sendErr;
        }

        const subject = pickSubject(tools.touched);
        const card = subject ? cardFor(subject) : null;
        if (card) {
          try {
            await space.send(
              customizedMiniApp({
                appName: card.appName,
                extensionBundleId: card.extensionBundleId,
                teamId: card.teamId,
                url: card.url,
                layout: { caption: card.caption, subcaption: card.subcaption },
              }),
            );
            console.log('[imessage] card sent OK', card.caption);
          } catch (cardErr) {
            // A card failure must not sink the whole reply — prose already went out.
            console.error('[imessage] card send FAILED (non-fatal)', cardErr);
          }
        }
      } catch (err) {
        console.error('[imessage] agent error', err);
        try { await space.send("Sorry — I hit a snag pulling that up. Try again in a moment."); }
        catch (e) { console.error('[imessage] fallback send FAILED', e); }
      } finally {
        await space.stopTyping?.();
      }
    } finally {
      settle();
    }
  });

  // Finish the reply INSIDE the request when we can. Spectrum acks the webhook
  // with an empty body immediately (the handler is fire-and-forget); Photon's
  // iMessage bridge, seeing no reply produced during the call, injects its own
  // "Sorry, I hit an error. Try again?" before our async space.send lands — so
  // the user gets a spurious error then the real reply. Awaiting the handler
  // here means the reply is already sent by the time we return, so the bridge
  // has nothing to fall back to. Cap the wait well under any webhook timeout;
  // a slow agent (rare, web-search heavy) finishes under waitUntil instead.
  await Promise.race([
    handlerDone,
    new Promise<void>((resolve) => setTimeout(resolve, 25_000)),
  ]);
  waitUntil(handlerDone);

  console.log('[imessage] webhook result', result.status);
  return new Response(result.body, { status: result.status, headers: result.headers });
}
