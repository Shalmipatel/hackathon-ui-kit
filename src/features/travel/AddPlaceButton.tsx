/**
 * Per-day "Add place" button + AI place search popover.
 *
 * Renders a small (+) chip next to a day's header. Click → opens a
 * portal'd popover (so it escapes the itinerary's overflow:auto clip)
 * with a debounced natural-language search input.
 *
 * Search pipeline (two stages):
 *  1. AI suggestion — `aiSuggestPlaces` sends the user's query + trip
 *     destination to the gateway's non-streaming LLM endpoint with a
 *     strict-JSON prompt. The LLM returns up to 6 named places that
 *     match the request semantically (e.g. "vegan restaurant").
 *  2. Geocoding — each name is geocoded via OpenStreetMap's Nominatim
 *     (free, no key) to attach lat/lng + a normalized address. The
 *     destination is appended to bias the geocode to the right city.
 *
 * Fallback — if the LLM returns nothing parseable, we hit Nominatim
 * directly with the raw query so the popover still gives a useful
 * result for literal lookups like "Eiffel Tower".
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styled, { keyframes } from 'styled-components';
import { getGateway } from '@/features/app/bootstrap/providers';
import { createSSEParser } from '@/providers/chat/sse-parser.util';
import { GATEWAY_ENDPOINTS } from '@/providers/transport/gateway-endpoints';

export interface PlaceResult {
  name: string;
  address: string;
  lat: number;
  lng: number;
  /** Optional one-line "why this fits" note from the AI suggester.
   *  Absent on literal Nominatim fallback results. */
  description?: string;
}

interface NominatimHit {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  name?: string;
  type?: string;
  class?: string;
}

interface Props {
  /** Day label used in the popover header ("Sat, Jun 13"). */
  dayLabel: string;
  /** Trip destination — prepended to search queries to bias results. */
  destinationHint?: string;
  onAdd: (place: PlaceResult) => void;
}

const Btn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  border: 1px dashed rgba(31, 36, 33, 0.28);
  background: transparent;
  color: rgba(31, 36, 33, 0.55);
  cursor: pointer;
  transition: all 0.12s;
  flex-shrink: 0;
  padding: 0;
  font-family: inherit;

  &:hover {
    border-style: solid;
    border-color: #216869;
    color: #216869;
    background: rgba(33, 104, 105, 0.06);
  }

  &:focus-visible {
    outline: 2px solid rgba(33, 104, 105, 0.4);
    outline-offset: 2px;
  }
`;

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const Popover = styled.div`
  position: fixed;
  /* Leaflet's panes/controls go up to z-index 1000 — sit above the map
     but stay below toast (100k) and ConnectionPrefsModal (10k). */
  z-index: 1100;
  width: 320px;
  background: #fff;
  border: 1px solid rgba(31, 36, 33, 0.1);
  border-radius: 14px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
  font-family: 'Inter', sans-serif;
  animation: ${fadeIn} 0.12s ease-out;
  overflow: hidden;
`;

const PopHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 6px;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(31, 36, 33, 0.55);
`;

const AiPill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(33, 104, 105, 0.1);
  color: #216869;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
`;

const ResultDesc = styled.div`
  font-size: 11.5px;
  color: rgba(31, 36, 33, 0.55);
  margin-top: 2px;
  font-style: italic;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const Input = styled.input`
  width: calc(100% - 20px);
  margin: 0 10px 8px;
  padding: 9px 11px;
  border: 1px solid rgba(31, 36, 33, 0.16);
  border-radius: 9px;
  font-family: inherit;
  font-size: 13px;
  color: #1F2421;
  background: #fff;

  &:focus {
    outline: none;
    border-color: #216869;
  }
`;

const ResultList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 260px;
  overflow-y: auto;
  border-top: 1px solid rgba(31, 36, 33, 0.06);
`;

const ResultItem = styled.li`
  padding: 9px 12px;
  cursor: pointer;
  border-bottom: 1px solid rgba(31, 36, 33, 0.04);
  transition: background 0.08s;

  &:hover, &:focus {
    background: rgba(33, 104, 105, 0.06);
    outline: none;
  }

  &:last-child {
    border-bottom: none;
  }
`;

const ResultName = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: #1F2421;
  letter-spacing: -0.2px;
`;

const ResultAddr = styled.div`
  font-size: 11.5px;
  color: rgba(31, 36, 33, 0.6);
  margin-top: 2px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const HintRow = styled.div`
  padding: 14px 14px 16px;
  font-size: 12px;
  color: rgba(31, 36, 33, 0.55);
  text-align: center;
`;

export const AddPlaceButton: React.FC<Props> = ({ dayLabel, destinationHint, onAdd }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  /* Anchor the popover BESIDE the button using a fixed position so it
     escapes the itinerary's overflow:auto clip. Prefer left of the
     button (since the button sits at the right edge of the day header
     there's usually more room there); flip to the right if the left
     side is too tight. Vertically center on the button, clamped to
     the viewport. Recompute on open and on scroll/resize. */
  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const popWidth = 320;
      const popHeight = 320;
      const gap = 8;
      const margin = 8;
      const spaceLeft = r.left;
      const spaceRight = window.innerWidth - r.right;
      /* Default to the left; flip right only when the left side won't
         fit and the right side will. */
      const placeLeft =
        spaceLeft >= popWidth + gap + margin || spaceLeft >= spaceRight;
      const left = placeLeft
        ? Math.max(margin, r.left - popWidth - gap)
        : Math.min(window.innerWidth - popWidth - margin, r.right + gap);
      /* Vertically center on the button, clamped to viewport. */
      const desiredTop = r.top + r.height / 2 - popHeight / 2;
      const top = Math.max(
        margin,
        Math.min(window.innerHeight - popHeight - margin, desiredTop),
      );
      setCoords({ top, left });
    };
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  /* Click-outside + Escape to close. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t)) return;
      if (btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  /* Debounced AI search. 500ms balances "feels responsive" against
     the LLM round-trip — the previous 350ms was tuned for Nominatim
     only, which is faster. If the LLM yields nothing usable we fall
     back to a literal Nominatim search so single-word lookups
     (e.g. "Eiffel Tower") still work. */
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      try {
        let hits = await aiSuggestPlaces(q, destinationHint, ctrl.signal);
        if (hits.length === 0) {
          hits = await geocodeNominatim(q, destinationHint, ctrl.signal);
        }
        if (!ctrl.signal.aborted) setResults(hits);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.warn('[add-place] AI search failed', err);
          /* Last-resort fallback so the popover never goes empty just
             because the LLM endpoint hiccuped. */
          try {
            const hits = await geocodeNominatim(q, destinationHint, ctrl.signal);
            if (!ctrl.signal.aborted) setResults(hits);
          } catch {
            if (!ctrl.signal.aborted) setResults([]);
          }
        }
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 500);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [query, destinationHint, open]);

  const handlePick = (place: PlaceResult) => {
    onAdd(place);
    setOpen(false);
    setQuery('');
    setResults([]);
  };

  const popover = open && coords && (
    <Popover
      ref={popRef}
      style={{ top: coords.top, left: coords.left }}
      role="dialog"
      aria-label={`Add a place to ${dayLabel}`}
    >
      <PopHeader>
        <span>Add to {dayLabel}</span>
        <AiPill>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 2 14 9l7 2-7 2-2 7-2-7-7-2 7-2z" />
          </svg>
          AI
        </AiPill>
      </PopHeader>
      <Input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder='Try "vegan ramen", "rooftop bar near the Louvre"…'
      />
      {query.trim().length === 0 ? (
        <HintRow>Ask in plain English — name, vibe, cuisine, anything.</HintRow>
      ) : loading ? (
        <HintRow>Thinking…</HintRow>
      ) : results.length === 0 ? (
        <HintRow>No matches. Try a different query.</HintRow>
      ) : (
        <ResultList>
          {results.map((r, i) => (
            <ResultItem
              key={`${r.lat}-${r.lng}-${i}`}
              tabIndex={0}
              onClick={() => handlePick(r)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handlePick(r);
                }
              }}
            >
              <ResultName>{r.name}</ResultName>
              {r.description && <ResultDesc>{r.description}</ResultDesc>}
              <ResultAddr>{r.address}</ResultAddr>
            </ResultItem>
          ))}
        </ResultList>
      )}
    </Popover>
  );

  return (
    <>
      <Btn
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Add a place to ${dayLabel}`}
        title="Add a place to this day"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </Btn>
      {popover && createPortal(popover, document.body)}
    </>
  );
};

/* ─── AI suggester ─────────────────────────────────────────────── */

interface LlmPlaceSuggestion {
  name?: unknown;
  description?: unknown;
}

/** Ask the gateway LLM for up to 6 real places matching the user's
 *  request, biased to the trip destination. Each suggestion's name
 *  is then geocoded (in parallel) via Nominatim to attach coords
 *  and a normalized address. Returns [] on any failure so the
 *  caller can fall back to a literal Nominatim search.
 *
 *  Verbose console logging is intentional — search debuggability
 *  matters more than log noise for this feature; trim once the
 *  flow is solid. */
async function aiSuggestPlaces(
  query: string,
  destinationHint: string | undefined,
  signal: AbortSignal,
): Promise<PlaceResult[]> {
  if (signal.aborted) return [];
  const dest = destinationHint?.trim() || 'the trip destination';
  /* Single combined user message instead of system + user — some
     `/v1/responses` gateway implementations strip or ignore the
     `system` role inside the input array, which silently produced
     non-JSON natural-language replies. Folding everything into one
     user prompt is the most portable shape. */
  const prompt = [
    `You are a concise travel concierge for a trip to: ${dest}.`,
    `The traveler said: "${query}"`,
    '',
    'Suggest 1 to 6 REAL, specific places that match their intent. A "place" is anything with a geographic location — restaurants, bars, museums, parks, hikes, trails, lakes, beaches, viewpoints, waterfalls, mountains, neighborhoods, monuments, gardens, markets, shops.',
    'Match INTENT, not literal words:',
    ' - "hikes" → specific trails / peaks (e.g. "Mount Tamalpais State Park", "Dipsea Trail").',
    ' - "lakes" → specific named lakes (e.g. "Lake Tahoe", "Donner Lake").',
    ' - "beaches" → specific named beaches.',
    ' - "vegan restaurant" → specific named restaurants known to be vegan.',
    'Always return concrete proper-noun names — never categories ("Hiking trails") or generic descriptions ("a great lake nearby").',
    'Use only places you are confident exist near or in the destination; do NOT invent names.',
    '',
    'Respond with ONLY a JSON array. No markdown fences, no commentary, no surrounding prose.',
    'Schema: [{"name": "<specific place name>", "description": "<one short line on why it fits>"}]',
    'If you genuinely cannot suggest any real place that fits, return [] (empty array).',
  ].join('\n');

  let raw: string;
  try {
    /* The gateway's /v1/responses endpoint ALWAYS returns SSE — the
       `stream:false` flag is ignored by this implementation. So we
       can't use NonStreamingClient (which calls .json() on the body
       and chokes on `event: response.created\n...`). Instead, drive
       the fetch ourselves and accumulate text deltas through the
       same SSE parser the chat uses. */
    raw = await streamLlmText(prompt, signal, 12_000);
  } catch (err) {
    if (signal.aborted) return [];
    console.warn('[add-place] LLM request failed', err);
    return [];
  }
  if (signal.aborted) return [];

  console.log('[add-place] LLM raw reply:', raw);
  const suggestions = parseLlmSuggestions(raw);
  console.log('[add-place] parsed suggestions:', suggestions);
  if (suggestions.length === 0) return [];

  /* Fan out geocoding in parallel — each lookup is independent and
     the user is waiting. Failures per-name are tolerated; we just
     drop those entries. */
  const geocoded: Array<PlaceResult | null> = await Promise.all(
    suggestions.map(async (s): Promise<PlaceResult | null> => {
      try {
        const hits = await geocodeNominatim(s.name, destinationHint, signal);
        const top = hits[0];
        if (!top) {
          console.log('[add-place] no geocode hit for:', s.name);
          return null;
        }
        return { ...top, name: s.name, description: s.description };
      } catch (err) {
        console.log('[add-place] geocode failed for:', s.name, err);
        return null;
      }
    }),
  );
  const final = geocoded.filter((x): x is PlaceResult => x !== null);
  console.log('[add-place] geocoded results:', final.length, 'of', suggestions.length);
  return final;
}

/** Tolerant JSON extractor — handles models that wrap the array in
 *  prose or ```json fences despite the system prompt. */
function parseLlmSuggestions(raw: string): Array<{ name: string; description?: string }> {
  if (!raw) return [];
  const trimmed = raw.trim();
  /* Strip a leading ```json or ``` fence if present. */
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fenced ? fenced[1] : trimmed;
  /* Grab the first JSON array we can find — survives leading prose. */
  const arrayMatch = candidate.match(/\[[\s\S]*\]/);
  if (!arrayMatch) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(arrayMatch[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: Array<{ name: string; description?: string }> = [];
  for (const item of parsed as LlmPlaceSuggestion[]) {
    if (!item || typeof item !== 'object') continue;
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (!name) continue;
    const description =
      typeof item.description === 'string' ? item.description.trim() : undefined;
    out.push({ name, description: description || undefined });
    if (out.length >= 6) break;
  }
  return out;
}

/** POST a single-turn user prompt to the gateway's /v1/responses
 *  endpoint and return the accumulated assistant text. Drives the
 *  SSE stream end-to-end and resolves only after `response.completed`
 *  (or the stream naturally closes / aborts / times out).
 *
 *  Built from scratch instead of using StreamClient because that one
 *  is session-scoped (it lives inside the chat store's session
 *  lifecycle). For a one-shot popover search we just need raw text. */
async function streamLlmText(
  prompt: string,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<string> {
  const gateway = getGateway();
  const body = JSON.stringify({
    model: 'openclaw',
    /* stream:true matches what the gateway actually does. The
       NonStreamingClient sets stream:false but the gateway here
       ignores that and streams anyway — being explicit avoids any
       behavior change if the gateway ever starts honoring it. */
    stream: true,
    user: 'neoclaw',
    input: [{ type: 'message', role: 'user', content: prompt }],
  });

  const prepared = await gateway.prepareRequest(GATEWAY_ENDPOINTS.CHAT, {
    method: 'POST',
    body,
  });

  /* Compose the caller's signal with a local timeout — whichever
     fires first aborts the fetch + the reader. */
  const localCtrl = new AbortController();
  const timeout = setTimeout(() => localCtrl.abort(), timeoutMs);
  const onParentAbort = () => localCtrl.abort();
  signal.addEventListener('abort', onParentAbort);

  let accumulated = '';
  let resolved = false;
  return new Promise<string>((resolve, reject) => {
    const finish = (ok: boolean, errOrText: string | Error) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      signal.removeEventListener('abort', onParentAbort);
      if (ok) resolve(errOrText as string);
      else reject(errOrText as Error);
    };

    const parser = createSSEParser({
      onDelta: (text) => {
        accumulated += text;
      },
      onDone: () => finish(true, accumulated),
      onError: (err) => finish(false, new Error(err || 'SSE error')),
    });

    void (async () => {
      let response: Response;
      try {
        response = await fetch(prepared.url, {
          ...prepared.init,
          signal: localCtrl.signal,
        });
      } catch (err) {
        if (localCtrl.signal.aborted) {
          finish(false, new Error(signal.aborted ? 'aborted' : 'timeout'));
        } else {
          finish(false, err as Error);
        }
        return;
      }

      if (!response.ok) {
        const txt = await response.text().catch(() => '');
        finish(false, new Error(`HTTP ${response.status}: ${txt.slice(0, 200)}`));
        return;
      }
      if (!response.body) {
        finish(false, new Error('Empty response body'));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          parser.feed(decoder.decode(value, { stream: true }));
        }
        /* Some gateways close the stream without emitting an explicit
           response.completed event — flush whatever we've got. */
        if (!resolved) finish(true, accumulated);
      } catch (err) {
        if (localCtrl.signal.aborted) {
          finish(false, new Error(signal.aborted ? 'aborted' : 'timeout'));
        } else {
          finish(false, err as Error);
        }
      }
    })();
  });
}

/* ─── Geocoder ─────────────────────────────────────────────────── */

async function geocodeNominatim(
  query: string,
  destinationHint: string | undefined,
  signal: AbortSignal,
): Promise<PlaceResult[]> {
  /* Bias toward the trip destination by appending it to the query.
     Cheap and effective for "Louvre" → "Louvre, Paris, France". */
  const composed = destinationHint
    ? `${query}, ${destinationHint}`
    : query;
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'json');
  url.searchParams.set('q', composed);
  url.searchParams.set('limit', '8');
  url.searchParams.set('addressdetails', '1');
  const res = await fetch(url.toString(), {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const hits = (await res.json()) as NominatimHit[];
  return hits.map((h) => {
    /* Nominatim's display_name is comma-separated, leading with the
       most specific name. Use it as both name (first chunk) and
       address (rest). */
    const parts = h.display_name.split(', ');
    const name = h.name?.trim() || parts[0] || h.display_name;
    const addressParts = parts.slice(name === parts[0] ? 1 : 0);
    return {
      name,
      address: addressParts.join(', '),
      lat: Number(h.lat),
      lng: Number(h.lon),
    };
  });
}

export default AddPlaceButton;
