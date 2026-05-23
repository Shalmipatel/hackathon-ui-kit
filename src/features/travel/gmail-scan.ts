/**
 * Lightweight Gmail API client for surfacing travel-confirmation
 * emails. Uses the access token from useGoogleAuth — no Node-side
 * Google CLI involved.
 *
 * Strategy: search for messages matching travel-confirmation keywords
 * within a sensible time window, then fetch each message's metadata
 * (subject, from, date, snippet). We deliberately skip the full body
 * for the first pass — snippet + subject is enough signal for the
 * agent to extract structured bookings via the booking-contract
 * prompt, and stays well under the token budget for a chat turn.
 */

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

const TRAVEL_QUERY =
  '(' +
  [
    'subject:(confirmation OR itinerary OR reservation OR booking OR e-ticket OR boarding)',
    'from:(airbnb OR booking.com OR expedia OR delta OR united OR aa.com OR jal OR lufthansa OR tap OR marriott OR hilton OR hyatt OR klook OR opentable OR resy)',
  ].join(' OR ') +
  ') newer_than:1y';

export interface GmailMessageSummary {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
}

interface GmailListResponse {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
}

interface GmailFullMessage {
  id: string;
  threadId: string;
  snippet?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
  };
}

class GmailApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'GmailApiError';
  }
}

async function gmailFetch<T>(token: string, path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${GMAIL_API}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new GmailApiError(resp.status, `Gmail API ${resp.status}: ${body.slice(0, 200)}`);
  }
  return (await resp.json()) as T;
}

function headerLookup(headers: Array<{ name: string; value: string }> | undefined, name: string): string {
  if (!headers) return '';
  const found = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return found?.value ?? '';
}

export interface ScanGmailOptions {
  /** Search query (Gmail search operator string). Default: travel keywords, last year. */
  query?: string;
  /** Max messages to return. Default 20. */
  maxResults?: number;
}

export async function scanGmail(
  token: string,
  options: ScanGmailOptions = {},
): Promise<GmailMessageSummary[]> {
  const q = options.query ?? TRAVEL_QUERY;
  const max = options.maxResults ?? 20;

  const list = await gmailFetch<GmailListResponse>(token, '/messages', {
    q,
    maxResults: String(max),
  });
  if (!list.messages || list.messages.length === 0) return [];

  /* Gmail's batch endpoint requires multipart with HTTP/1.1 framing in the
     body — gnarly in the browser. Parallel singles are fast enough for
     ~20 messages and keep this file < 200 lines. */
  const detailed = await Promise.all(
    list.messages.slice(0, max).map((m) =>
      gmailFetch<GmailFullMessage>(token, `/messages/${m.id}`, {
        format: 'metadata',
        metadataHeaders: 'From',
      })
        .then(async (msg) => {
          /* Fetch a separate call for Subject + Date headers — Gmail's
             metadataHeaders param has a quirk where multiple values
             need to be repeated rather than comma-joined. Just refetch. */
          const withMore = await gmailFetch<GmailFullMessage>(token, `/messages/${msg.id}`, {
            format: 'metadata',
          });
          return withMore;
        })
        .catch((err: unknown) => {
          console.warn('[gmail-scan] failed to fetch message', m.id, err);
          return null;
        }),
    ),
  );

  const summaries: GmailMessageSummary[] = [];
  for (const msg of detailed) {
    if (!msg) continue;
    summaries.push({
      id: msg.id,
      threadId: msg.threadId,
      subject: headerLookup(msg.payload?.headers, 'Subject'),
      from: headerLookup(msg.payload?.headers, 'From'),
      date: headerLookup(msg.payload?.headers, 'Date'),
      snippet: (msg.snippet ?? '').trim(),
    });
  }
  return summaries;
}

/** Render the scan results into a chat-friendly transcript the agent can
 *  parse via the booking contract. Kept compact so we don't blow the
 *  context window. */
export function emailsToChatPayload(emails: GmailMessageSummary[]): string {
  if (emails.length === 0) return '_No travel confirmation emails found in the last year._';
  return emails
    .map((e, i) => {
      const lines = [
        `[Email ${i + 1}]`,
        `From: ${e.from}`,
        `Subject: ${e.subject}`,
        `Date: ${e.date}`,
        `Snippet: ${e.snippet}`,
      ];
      return lines.join('\n');
    })
    .join('\n\n---\n\n');
}
