/**
 * Per-day "Add place" button + search popover.
 *
 * Renders a small (+) chip next to a day's header. Click → opens a
 * portal'd popover (so it escapes the itinerary's overflow:auto clip)
 * with a debounced search input. We hit OpenStreetMap's Nominatim
 * geocoder — zero config, decent global coverage, and matches the
 * Leaflet/OSM stack the rest of the app already uses. Easy to swap
 * to Google Places later: replace `geocodeNominatim` with a Places
 * Autocomplete call that returns the same shape.
 *
 * Search is biased toward the trip destination by prepending the
 * destination string to the query — Nominatim's `viewbox` would be
 * stricter but requires a lat/lon box we don't always have for a
 * trip. The prepend trick is good enough for "find the Eiffel Tower
 * when I'm planning a Paris trip".
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styled, { keyframes } from 'styled-components';

export interface PlaceResult {
  name: string;
  address: string;
  lat: number;
  lng: number;
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

  /* Debounced geocode. 350ms feels responsive without spamming
     Nominatim (whose courtesy limit is 1 req/sec for the free tier). */
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
        const hits = await geocodeNominatim(q, destinationHint, ctrl.signal);
        setResults(hits);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.warn('[add-place] geocode failed', err);
          setResults([]);
        }
      } finally {
        setLoading(false);
      }
    }, 350);
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
      </PopHeader>
      <Input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a place, restaurant, museum…"
      />
      {query.trim().length === 0 ? (
        <HintRow>Type to search for a location.</HintRow>
      ) : loading ? (
        <HintRow>Searching…</HintRow>
      ) : results.length === 0 ? (
        <HintRow>No matches. Try a different name.</HintRow>
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
