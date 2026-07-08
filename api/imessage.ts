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
import { runAgent } from '../server/agent';
import { pickSubject, cardFor } from '../server/card';

export const config = { runtime: 'nodejs' };

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

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const app = await getApp();

  const result = await app.webhook(req, async (space, message) => {
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
        await space.send(
          customizedMiniApp({
            appName: card.appName,
            extensionBundleId: card.extensionBundleId,
            teamId: card.teamId,
            url: card.url,
            layout: { caption: card.caption, subcaption: card.subcaption },
          }),
        );
      }
    } catch (err) {
      console.error('[imessage] agent error', err);
      await space.send("Sorry — I hit a snag pulling that up. Try again in a moment.");
    } finally {
      await space.stopTyping?.();
    }
  });

  return new Response(result.body, { status: result.status, headers: result.headers });
}
