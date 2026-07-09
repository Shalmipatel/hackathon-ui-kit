// The iMessage brain: grok-4.5 via xAI's Responses API with the trip tools +
// hosted web/x search. Non-streaming (a webhook is fire-and-forget), looped
// over tool rounds. Returns the prose reply and the Tools instance so the
// caller can attach a rich card for a single-subject answer.

import { Tools, toolSchemas } from './tools.js';
import type { View } from './view.js';

const XAI_URL = 'https://api.x.ai/v1/responses';
const MODEL = process.env.XAI_CHAT_MODEL ?? 'grok-4.5';
const KEY = process.env.XAI_API_KEY ?? '';

const MAX_ROUNDS = 8;

function buildSystemPrompt(): string {
  const now = new Date();
  const todayISO = now.toISOString().slice(0, 10);
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });

  return `You are Wanderbot, a sharp, concise travel assistant answering over iMessage. \
Keep replies SHORT and plain-text — no markdown, no bullet symbols, iMessage shows them raw. \
You have live web search for current info (weather, hours, prices). You also have tools that \
read and edit the traveler's real trips and itineraries — use them for any question about their \
plan and for every change they ask for. Never invent trip state: read it with get_itinerary \
first. After editing, confirm briefly what changed. You cannot make real reservations — add the \
item to the itinerary instead.

Today's date: ${todayISO} (${weekday}). Dates are the easiest thing to get wrong here — follow \
these rules exactly:
- Resolve every relative date ("tomorrow", "next Friday", "in two weeks") by counting forward \
from today's date above, not from a guess or a date mentioned earlier in the conversation.
- When a date has no year (e.g. "Aug 14", or a date pulled from a booking site/email), assume \
the CURRENT year — UNLESS that month/day already passed this year, in which case use NEXT year. \
Trips get added before they happen.
- For a multi-day item (hotel stay, overnight flight), end_day must be on or after day — check \
this against nights/duration if given before writing it.
- A trip is UPCOMING only if its end date is on or after today; otherwise it is PAST. For "next \
trip" / "upcoming trip" questions, compare EVERY trip's start and end dates to today's date \
above and pick the soonest trip that hasn't ended yet (a trip happening right now counts). Do \
not just pick the earliest calendar month — Feb 2026 is in the PAST relative to Jul 2026. If \
every trip has already ended, say there's nothing upcoming.
- After creating or updating a date, restate it back to the traveler in your reply (e.g. "Added \
for Fri, Aug 14, 2026") so a misread is easy to catch and correct.

RICH CARDS — you can render a native visual card in the traveler's Messages via present_view. Use it \
when the answer is a LIST of options, a COMPARISON, PLACES, WEATHER, a PACKING/prep CHECKLIST, a \
BUDGET breakdown, or a SUGGESTED day/plan.
- When you use it, keep your text reply to ONE short introductory sentence. The card carries the \
detail — don't repeat it in prose.
- Attach an add_booking action to anything the traveler could add; pass trip_id so Add works. Give \
each actionable row a stable id. Prefer to OMIT booking.day (we place it sensibly) rather than guess.
- Do NOT call present_view for a one-line answer, a yes/no, or to confirm an edit you already made.
- Accuracy over polish: never fabricate coordinates or exact prices — verify with web_search, or \
write "~$200" / omit the field. A wrong pin or price is worse than none.`;
}

interface FnCall { call_id: string; name: string; args: string }

function parseOutput(output: unknown[]): { text: string; calls: FnCall[] } {
  let text = '';
  const calls: FnCall[] = [];
  for (const item of output as Array<Record<string, unknown>>) {
    if (item.type === 'function_call') {
      calls.push({
        call_id: String(item.call_id ?? ''),
        name: String(item.name ?? ''),
        args: String(item.arguments ?? ''),
      });
    } else if (item.type === 'message') {
      for (const c of (item.content as Array<Record<string, unknown>>) ?? []) {
        if (c.type === 'output_text') text += String(c.text ?? '');
      }
    }
  }
  return { text, calls };
}

export interface AgentResult {
  reply: string;
  tools: Tools;
  /** A rich view the agent chose to render via present_view, if any. */
  view?: View;
}

// grok's hosted web_search injects markdown citations like `[[1]](https://…)`
// and occasional **bold**/[label](url) links. iMessage renders none of it — the
// user just sees the raw brackets and parens. Flatten it to clean plain text.
export function stripMarkup(s: string): string {
  return s
    // Citation chips: `[[1]](url)` / ` [1](url)` → drop entirely.
    .replace(/\s*\[\[?\d+\]?\]\((https?:[^)]+)\)/g, '')
    // Inline links `[label](url)` → keep the label only.
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1')
    // Bold/italic/code emphasis markers.
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(?<!\w)[*_]([^*_]+)[*_](?!\w)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    // Collapse any doubled spaces the removals left behind.
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([.,!?])/g, '$1')
    .trim();
}

export async function runAgent(userText: string): Promise<AgentResult> {
  const tools = new Tools();
  await tools.load();

  const sessionTools = [
    { type: 'web_search' },
    { type: 'x_search' },
    ...toolSchemas,
  ];

  // Stateless: carry the whole conversation in `input` each round. xAI's
  // Responses API rejects previous_response_id chaining ("Response ... not
  // found"), so we re-send the function_call items and their outputs rather
  // than referencing a stored prior turn.
  const input: unknown[] = [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: userText },
  ];
  let finalText = '';

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const body = { model: MODEL, input, tools: sessionTools, stream: false };
    const res = await fetch(XAI_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`xAI HTTP ${res.status}: ${err.slice(0, 200)}`);
    }
    const json = (await res.json()) as { output: unknown[] };
    const { text, calls } = parseOutput(json.output ?? []);
    if (text) finalText = text;
    if (!calls.length) break;

    // Append the assistant's function calls, then each call's output.
    for (const call of calls) {
      input.push({ type: 'function_call', call_id: call.call_id, name: call.name, arguments: call.args });
    }
    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(call.args || '{}'); } catch { /* empty */ }
      const output = await tools.execute(call.name, args);
      input.push({ type: 'function_call_output', call_id: call.call_id, output });
    }
  }

  return { reply: stripMarkup(finalText) || 'Done.', tools, view: tools.pendingView };
}
