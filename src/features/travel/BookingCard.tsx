/**
 * Booking card with two states:
 *   - compact  → time / title / subtitle / pill (the default)
 *   - expanded → inline editor with title, date+time, end, notes,
 *                location read-out, details, and a delete button.
 *
 * Expansion is driven by the `focused` prop (which the parent toggles
 * via `onClick`). When focused, the card mounts an outside-click + Esc
 * listener that calls `onCollapse` to clear focus. Auto-save: every
 * editable field commits to the store on blur (or `onChange` for
 * native date/time inputs that don't expose a blur signal cleanly).
 *
 * Browser detail: native `<input type="date">` / `<input type="time">`
 * pickers render in a compositor layer outside the DOM, so clicking
 * inside them does NOT fire document mousedown — which means the
 * outside-click handler doesn't accidentally collapse the card while
 * the user is picking a date or time.
 */

import React, { useEffect, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import type { Booking, BookingType } from './types';
import {
  formatDayLabel,
  formatDuration,
  formatMoney,
  formatTimeOfDay,
  isoTimeOnly,
  localDateKey,
  replaceIsoDate,
  replaceIsoTime,
} from './format';
import { useTravelStore } from './travel-store';

/* ── Shared shell ──────────────────────────────────────────────── */

const Card = styled.div<{ $focused?: boolean; $expanded?: boolean }>`
  border-radius: 14px;
  background: #fff;
  border: 1px solid
    ${(p) => (p.$focused ? 'rgba(33, 104, 105, 0.55)' : 'rgba(36, 36, 36, 0.07)')};
  font-family: 'Inter', sans-serif;
  position: relative;
  transition: border-color 0.15s, box-shadow 0.2s;
  ${(p) =>
    p.$expanded
      ? `
    box-shadow: 0 12px 32px rgba(31, 36, 33, 0.12);
    cursor: default;
  `
      : `
    cursor: pointer;
    &:hover {
      border-color: rgba(36, 36, 36, 0.22);
      box-shadow: 0 2px 8px rgba(36, 36, 36, 0.05);
    }
  `}
`;

/* ── Compact layout ────────────────────────────────────────────── */

const CompactGrid = styled.div`
  display: grid;
  grid-template-columns: 80px 1fr auto;
  gap: 16px;
  align-items: center;
  padding: 14px 16px;

  @media (max-width: 600px) {
    grid-template-columns: 56px 1fr;
    gap: 12px;
    padding: 12px;
  }
`;

const TimeCol = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: flex-start;
`;

const Time = styled.div`
  font-weight: 600;
  font-size: 14px;
  color: #242424;
  letter-spacing: -0.3px;
  line-height: 18px;
  font-variant-numeric: tabular-nums;
`;

const SubTime = styled.div`
  font-size: 11px;
  color: rgba(36, 36, 36, 0.5);
  font-weight: 500;
`;

const AddTimeBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px dashed rgba(33, 104, 105, 0.4);
  background: transparent;
  color: #216869;
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: -0.1px;
  padding: 4px 9px;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.12s;

  &:hover {
    background: rgba(33, 104, 105, 0.08);
    border-style: solid;
  }
`;

const TimeInput = styled.input`
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  color: #1F2421;
  padding: 4px 6px;
  border: 1px solid rgba(33, 104, 105, 0.45);
  border-radius: 8px;
  background: #fff;
  width: 100px;

  &:focus { outline: 2px solid rgba(33, 104, 105, 0.3); outline-offset: 1px; }
`;

const BodyCol = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
`;

const Title = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 15px;
  color: #242424;
  letter-spacing: -0.3px;
  line-height: 20px;
`;

const Sub = styled.div`
  font-size: 12.5px;
  color: rgba(36, 36, 36, 0.62);
  line-height: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Tail = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  font-size: 11.5px;
  color: rgba(36, 36, 36, 0.55);

  @media (max-width: 600px) {
    display: none;
  }
`;

const Pill = styled.span<{ $tone?: 'email' | 'agent' | 'manual' }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  background: ${(p) =>
    p.$tone === 'email'
      ? 'rgba(254, 235, 41, 0.55)'
      : p.$tone === 'agent'
        ? 'rgba(99, 102, 241, 0.12)'
        : 'rgba(36, 36, 36, 0.06)'};
  color: ${(p) =>
    p.$tone === 'email'
      ? '#5a4a00'
      : p.$tone === 'agent'
        ? '#3730a3'
        : 'rgba(36, 36, 36, 0.75)'};
`;

const IconWrap = styled.div<{ $type: BookingType }>`
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #242424;
  background: ${(p) => TONE_BG[p.$type] ?? 'rgba(168, 85, 247, 0.18)'};
`;

/* Single source of truth for per-type icon-tile background tints.
   Kept close to IconWrap so adding a new type means one edit. */
const TONE_BG: Record<BookingType, string> = {
  flight: 'rgba(56, 189, 248, 0.18)',     // sky blue
  hotel: 'rgba(250, 204, 21, 0.22)',      // amber
  attraction: 'rgba(217, 119, 6, 0.18)',  // burnt orange (landmarks)
  experience: 'rgba(20, 184, 166, 0.18)', // teal (wellness/learning)
  event: 'rgba(236, 72, 153, 0.18)',      // pink (entertainment)
  activity: 'rgba(168, 85, 247, 0.18)',   // purple (catch-all)
  restaurant: 'rgba(248, 113, 113, 0.18)',// red
  transport: 'rgba(73, 160, 120, 0.18)',  // green
};

/* ── Expanded layout ───────────────────────────────────────────── */

const expandKeyframes = keyframes`
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const ExpandedBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 16px 18px 18px;
  animation: ${expandKeyframes} 0.16s ease-out;
`;

const ExpandedHead = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 12px;
`;

const ExpandedHeadMain = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const TitleInput = styled.input`
  display: block;
  width: 100%;
  margin: 0;
  padding: 4px 6px;
  border: 1px solid transparent;
  background: transparent;
  font-family: inherit;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.3px;
  color: #1F2421;
  line-height: 22px;
  border-radius: 8px;
  transition: border-color 0.12s, background 0.12s;

  &:hover { border-color: rgba(31, 36, 33, 0.12); }
  &:focus { outline: none; border-color: #216869; background: #fff; }
`;

const HeadMetaRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 11.5px;
  color: rgba(36, 36, 36, 0.6);
  padding-left: 6px;
`;

const CloseBtn = styled.button`
  background: transparent;
  border: none;
  cursor: pointer;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(36, 36, 36, 0.55);
  transition: background 0.12s;
  flex-shrink: 0;

  &:hover { background: rgba(36, 36, 36, 0.06); color: #242424; }
`;

const SectionTitle = styled.h3`
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: rgba(36, 36, 36, 0.55);
  text-transform: uppercase;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 88px 1fr;
  gap: 10px 14px;
  align-items: center;
  font-size: 13px;
`;

const RowLabel = styled.label`
  color: rgba(36, 36, 36, 0.55);
  font-weight: 500;
  letter-spacing: -0.2px;
`;

const FieldInput = styled.input`
  width: 100%;
  font-family: inherit;
  font-size: 13px;
  color: #1F2421;
  padding: 7px 10px;
  border: 1px solid rgba(31, 36, 33, 0.14);
  border-radius: 8px;
  background: #fff;
  transition: border-color 0.12s;

  &:hover { border-color: rgba(31, 36, 33, 0.28); }
  &:focus { outline: none; border-color: #216869; }
`;

const ReadOnlyValue = styled.div`
  color: #1F2421;
  font-weight: 500;
  letter-spacing: -0.2px;
  word-break: break-word;
`;

const AddTimePill = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px dashed rgba(33, 104, 105, 0.45);
  background: transparent;
  color: #216869;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: -0.2px;
  padding: 7px 12px;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.12s;
  width: fit-content;

  &:hover { background: rgba(33, 104, 105, 0.08); border-style: solid; }
`;

const NotesArea = styled.textarea`
  width: 100%;
  min-height: 76px;
  resize: vertical;
  font-family: inherit;
  font-size: 13px;
  line-height: 19px;
  color: #1F2421;
  padding: 10px 12px;
  border: 1px solid rgba(31, 36, 33, 0.14);
  border-radius: 10px;
  background: #fff;
  transition: border-color 0.12s;

  &::placeholder { color: rgba(31, 36, 33, 0.4); }
  &:hover { border-color: rgba(31, 36, 33, 0.28); }
  &:focus { outline: none; border-color: #216869; }
`;

const Actions = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 4px;
`;

const DangerBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(239, 68, 68, 0.4);
  background: rgba(239, 68, 68, 0.06);
  color: #dc2626;
  font-family: inherit;
  font-weight: 500;
  font-size: 12.5px;
  padding: 7px 12px;
  border-radius: 9px;
  cursor: pointer;
  transition: all 0.12s;

  &:hover { background: rgba(239, 68, 68, 0.12); }
`;

const InputRowFlex = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

/* ── Icons & helpers ───────────────────────────────────────────── */

function BookingIcon({ type }: { type: BookingType }) {
  switch (type) {
    case 'flight':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
        </svg>
      );
    case 'hotel':
      /* House silhouette — pitched roof + door. Reads more universally
         as "place you sleep" than the previous boxy building. */
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      );
    case 'activity':
      /* Hiker — user-supplied stroke-based path (svgrepo "hiking"),
         backpacker mid-stride with walking stick. Matches the rest
         of the type icons' stroke aesthetic. */
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 22V16L12 14M12 14L13 8M12 14H10M13 8C14 9.16667 15.6 11 18 11M13 8L12.8212 7.82124C12.2565 7.25648 11.2902 7.54905 11.1336 8.33223L10 14M10 14L8 22M18 9.5V22M8 7H7.72076C7.29033 7 6.90819 7.27543 6.77208 7.68377L5.5 11.5L7 12L8 7ZM14.5 3.5C14.5 4.05228 14.0523 4.5 13.5 4.5C12.9477 4.5 12.5 4.05228 12.5 3.5C12.5 2.94772 12.9477 2.5 13.5 2.5C14.0523 2.5 14.5 2.94772 14.5 3.5Z" />
        </svg>
      );
    case 'attraction':
      /* Camera/landmark — museums, monuments, viewpoints. */
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      );
    case 'experience':
      /* Sparkle — classes, tastings, spas, wellness. */
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v3" />
          <path d="M12 18v3" />
          <path d="M3 12h3" />
          <path d="M18 12h3" />
          <path d="m5.6 5.6 2.1 2.1" />
          <path d="m16.3 16.3 2.1 2.1" />
          <path d="m5.6 18.4 2.1-2.1" />
          <path d="m16.3 7.7 2.1-2.1" />
        </svg>
      );
    case 'event':
      /* Ticket — shows, concerts, games, theme parks. */
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7v3a2 2 0 0 0 0 4v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a2 2 0 0 0 0-4V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" />
          <path d="M13 5v2" />
          <path d="M13 17v2" />
          <path d="M13 11v2" />
        </svg>
      );
    case 'restaurant':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 2v7c0 1.7 1.3 3 3 3v10" />
          <path d="M7 2v20" />
          <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.7 1.3 3 3 3v6" />
        </svg>
      );
    case 'transport':
      /* Car (lucide-style) — ground transport: rental, transfer,
         intercity drive. */
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
          <circle cx="7" cy="17" r="2" />
          <path d="M9 17h6" />
          <circle cx="17" cy="17" r="2" />
        </svg>
      );
  }
}

/** Render a route segment ("SFO → ZRH") only when both endpoints
 *  exist. The agent occasionally writes flight/transport rows
 *  without `from` or `to`; we'd rather show an empty string than
 *  crash the whole card. */
function routeLine(
  from: { name?: string; address?: string } | undefined,
  to: { name?: string; address?: string } | undefined,
  preferAddress: boolean,
): string {
  const fromLabel = from
    ? preferAddress
      ? from.address ?? from.name
      : from.name
    : undefined;
  const toLabel = to
    ? preferAddress
      ? to.address ?? to.name
      : to.name
    : undefined;
  if (fromLabel && toLabel) return `${fromLabel} → ${toLabel}`;
  return fromLabel ?? toLabel ?? '';
}

function bookingSubtitle(booking: Booking): string {
  switch (booking.type) {
    case 'flight':
      return [
        booking.flightNumber,
        booking.provider,
        routeLine(booking.from, booking.to, true),
      ]
        .filter(Boolean)
        .join(' · ');
    case 'hotel':
      return [
        booking.place?.address ?? booking.place?.name,
        booking.nights ? `${booking.nights} night${booking.nights === 1 ? '' : 's'}` : '',
        booking.provider,
      ]
        .filter(Boolean)
        .join(' · ');
    case 'activity':
    case 'attraction':
    case 'experience':
    case 'event':
      return [booking.place?.address ?? booking.place?.name, booking.provider]
        .filter(Boolean)
        .join(' · ');
    case 'restaurant':
      return [
        booking.place?.address ?? booking.place?.name,
        booking.partySize ? `Party of ${booking.partySize}` : '',
      ]
        .filter(Boolean)
        .join(' · ');
    case 'transport':
      return [
        booking.mode,
        routeLine(booking.from, booking.to, false),
        booking.provider,
      ]
        .filter(Boolean)
        .join(' · ');
  }
}

function locationLine(b: Booking): { label: string; address?: string } | null {
  switch (b.type) {
    case 'flight':
    case 'transport': {
      const label = routeLine(b.from, b.to, false);
      return label ? { label } : null;
    }
    case 'hotel':
    case 'activity':
    case 'attraction':
    case 'experience':
    case 'event':
    case 'restaurant':
      if (!b.place) return null;
      return { label: b.place.name, address: b.place.address };
  }
}

function whenLineReadOnly(b: Booking): string {
  /* New model: `start` is optional. No start ⇒ just the day. */
  const dayKey = b.start ? b.start.slice(0, 10) : b.dayKey;
  if (!b.start || b.hasTime === false) return formatDayLabel(dayKey);
  const startTime = formatTimeOfDay(b.start);
  if (!b.end) return `${formatDayLabel(dayKey)} · ${startTime}`;
  const endDayKey = b.end.slice(0, 10);
  const endTime = formatTimeOfDay(b.end);
  if (dayKey === endDayKey) {
    return `${formatDayLabel(dayKey)} · ${startTime} → ${endTime} · ${formatDuration(b.start, b.end)}`;
  }
  return `${formatDayLabel(dayKey)} ${startTime} → ${formatDayLabel(endDayKey)} ${endTime} · ${formatDuration(b.start, b.end)}`;
}

/* ── Component ─────────────────────────────────────────────────── */

interface BookingCardProps {
  booking: Booking;
  focused?: boolean;
  /** Fired when the user clicks the compact card to expand it. */
  onClick?: () => void;
  /** Fired when the expanded card requests to collapse (outside
   *  click, Escape, or the close button). */
  onCollapse?: () => void;
  /** YYYY-MM-DD of the day section this card is rendered under. For
   *  multi-day bookings, the time column adapts: start day shows
   *  check-in/departure time, end day shows check-out/arrival time,
   *  middle days show "All day". Omit to fall back to start-time only. */
  dayKey?: string;
  /** When true, render a small lock chip in the tail to communicate
   *  the card can't be dragged on the timeline. Tap-to-edit still
   *  works via the detail modal. */
  locked?: boolean;
}

function multiDayLabels(type: BookingType): { start: string; end: string } {
  switch (type) {
    case 'flight':
    case 'transport':
      return { start: 'Departs', end: 'Arrives' };
    case 'hotel':
      return { start: 'Check-in', end: 'Check-out' };
    case 'activity':
    case 'attraction':
    case 'experience':
    case 'event':
    case 'restaurant':
      return { start: 'Starts', end: 'Ends' };
  }
}

export const BookingCard: React.FC<BookingCardProps> = ({
  booking,
  focused,
  onClick,
  onCollapse,
  dayKey,
  locked,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const dur = booking.start
    ? formatDuration(booking.start, booking.end)
    : '';
  const upsertBooking = useTravelStore((s) => s.upsertBooking);
  const deleteBooking = useTravelStore((s) => s.deleteBooking);
  /* New model: untimed = no `start`. We still support legacy
     `hasTime: false` for any record that slipped past the migration. */
  const hasNoTime = !booking.start || booking.hasTime === false;

  /* Compact-mode inline time picker (used only when collapsed). */
  const [editingTime, setEditingTime] = useState(false);

  /* Controlled mirrors for the editable text fields. Re-sync if the
     booking is swapped out (e.g. id change). */
  const [title, setTitle] = useState(booking.title);
  const [notes, setNotes] = useState(booking.notes ?? '');
  useEffect(() => setTitle(booking.title), [booking.id, booking.title]);
  useEffect(() => setNotes(booking.notes ?? ''), [booking.id, booking.notes]);

  /* Outside click + Esc → collapse. Native date/time pickers render
     in a compositor layer and don't fire DOM mousedown, so they won't
     accidentally close the card. */
  useEffect(() => {
    if (!focused) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (cardRef.current?.contains(t)) return;
      onCollapse?.();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCollapse?.();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [focused, onCollapse]);

  /* When the card first becomes focused (e.g. via a map-pin click
     while it's scrolled off-screen) bring it into view. */
  useEffect(() => {
    if (focused && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focused]);

  const commit = (patch: Partial<Booking>) => {
    upsertBooking({ ...booking, ...patch } as Booking);
  };

  /* Day to anchor a freshly-added time against. Falls back to the
     booking's `dayKey` when there's no existing `start` (untimed). */
  const baseDayKey = booking.start
    ? booking.start.slice(0, 10)
    : booking.dayKey;

  const commitInlineTime = (value: string) => {
    setEditingTime(false);
    if (!value) return;
    const [hh, mm] = value.split(':');
    if (!hh || !mm) return;
    const newStart = booking.start
      ? replaceIsoTime(booking.start, hh, mm)
      : `${baseDayKey}T${hh.padStart(2, '0')}:${mm.padStart(2, '0')}:00`;
    commit({ start: newStart });
  };

  const handleStartDate = (dateKey: string) => {
    if (!dateKey) return;
    if (!booking.start) {
      commit({ dayKey: dateKey });
      return;
    }
    commit({ start: replaceIsoDate(booking.start, dateKey), dayKey: dateKey });
  };
  const handleStartTime = (time: string) => {
    if (!time) return;
    const [hh, mm] = time.split(':');
    const newStart = booking.start
      ? replaceIsoTime(booking.start, hh, mm)
      : `${baseDayKey}T${hh.padStart(2, '0')}:${mm.padStart(2, '0')}:00`;
    commit({ start: newStart });
  };
  const handleEndDate = (dateKey: string) => {
    if (!dateKey || !booking.end) return;
    commit({ end: replaceIsoDate(booking.end, dateKey) });
  };
  const handleEndTime = (time: string) => {
    if (!time || !booking.end) return;
    const [hh, mm] = time.split(':');
    commit({ end: replaceIsoTime(booking.end, hh, mm) });
  };

  const stopBubble = (e: React.MouseEvent) => e.stopPropagation();

  /* ── Expanded render ─────────────────────────────────────────── */
  if (focused) {
    const loc = locationLine(booking);
    const startDate = booking.start ? booking.start.slice(0, 10) : booking.dayKey;
    const startTime = booking.start ? isoTimeOnly(booking.start) : '';
    const endDate = booking.end?.slice(0, 10) ?? '';
    const endTime = booking.end ? isoTimeOnly(booking.end) : '';

    return (
      <Card
        ref={cardRef}
        $focused={focused}
        $expanded
        onClick={stopBubble}
      >
        <ExpandedBody>
          <ExpandedHead>
            <IconWrap $type={booking.type}>
              <BookingIcon type={booking.type} />
            </IconWrap>
            <ExpandedHeadMain>
              <TitleInput
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => {
                  const next = title.trim();
                  if (next && next !== booking.title) commit({ title: next });
                  else setTitle(booking.title);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') {
                    setTitle(booking.title);
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                aria-label="Title"
              />
              <HeadMetaRow>
                <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>{booking.type}</span>
                {booking.provider && <span>· {booking.provider}</span>}
                <Pill $tone={booking.source}>
                  {booking.source === 'email' ? 'From email' : booking.source}
                </Pill>
              </HeadMetaRow>
            </ExpandedHeadMain>
            <CloseBtn onClick={() => onCollapse?.()} aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </CloseBtn>
          </ExpandedHead>

          <div>
            <SectionTitle>When</SectionTitle>
            <Row>
              <RowLabel htmlFor={`start-date-${booking.id}`}>Starts</RowLabel>
              <InputRowFlex>
                <FieldInput
                  id={`start-date-${booking.id}`}
                  type="date"
                  value={startDate}
                  onChange={(e) => handleStartDate(e.target.value)}
                  style={{ maxWidth: 160 }}
                />
                {hasNoTime ? (
                  <AddTimePill
                    type="button"
                    onClick={() => handleStartTime('12:00')}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    Add time
                  </AddTimePill>
                ) : (
                  <FieldInput
                    type="time"
                    value={startTime}
                    onChange={(e) => handleStartTime(e.target.value)}
                    style={{ maxWidth: 130 }}
                  />
                )}
              </InputRowFlex>
              {booking.end !== undefined && (
                <>
                  <RowLabel htmlFor={`end-date-${booking.id}`}>Ends</RowLabel>
                  <InputRowFlex>
                    <FieldInput
                      id={`end-date-${booking.id}`}
                      type="date"
                      value={endDate}
                      onChange={(e) => handleEndDate(e.target.value)}
                      style={{ maxWidth: 160 }}
                    />
                    <FieldInput
                      type="time"
                      value={endTime}
                      onChange={(e) => handleEndTime(e.target.value)}
                      style={{ maxWidth: 130 }}
                    />
                  </InputRowFlex>
                </>
              )}
              {!hasNoTime && (
                <>
                  <RowLabel>Summary</RowLabel>
                  <ReadOnlyValue style={{ color: 'rgba(31,36,33,0.65)', fontWeight: 400 }}>
                    {whenLineReadOnly(booking)}
                  </ReadOnlyValue>
                </>
              )}
            </Row>
          </div>

          {loc && (
            <div>
              <SectionTitle>Where</SectionTitle>
              <Row>
                <RowLabel>Location</RowLabel>
                <ReadOnlyValue>{loc.label}</ReadOnlyValue>
                {loc.address && (
                  <>
                    <RowLabel>Address</RowLabel>
                    <ReadOnlyValue>{loc.address}</ReadOnlyValue>
                  </>
                )}
              </Row>
            </div>
          )}

          {(booking.confirmation || booking.cost ||
            (booking.type === 'flight' && (booking.flightNumber || booking.cabin)) ||
            (booking.type === 'transport' && booking.mode) ||
            (booking.type === 'hotel' && booking.nights) ||
            (booking.type === 'restaurant' && booking.partySize)) && (
            <div>
              <SectionTitle>Details</SectionTitle>
              <Row>
                {booking.type === 'flight' && booking.flightNumber && (
                  <>
                    <RowLabel>Flight</RowLabel>
                    <ReadOnlyValue>{booking.flightNumber}</ReadOnlyValue>
                  </>
                )}
                {booking.type === 'flight' && booking.cabin && (
                  <>
                    <RowLabel>Cabin</RowLabel>
                    <ReadOnlyValue>{booking.cabin}</ReadOnlyValue>
                  </>
                )}
                {booking.type === 'transport' && booking.mode && (
                  <>
                    <RowLabel>Mode</RowLabel>
                    <ReadOnlyValue>{booking.mode}</ReadOnlyValue>
                  </>
                )}
                {booking.type === 'hotel' && booking.nights && (
                  <>
                    <RowLabel>Nights</RowLabel>
                    <ReadOnlyValue>{booking.nights}</ReadOnlyValue>
                  </>
                )}
                {booking.type === 'restaurant' && booking.partySize && (
                  <>
                    <RowLabel>Party</RowLabel>
                    <ReadOnlyValue>{booking.partySize}</ReadOnlyValue>
                  </>
                )}
                {booking.confirmation && (
                  <>
                    <RowLabel>Confirmation</RowLabel>
                    <ReadOnlyValue style={{ fontFamily: 'ui-monospace, monospace' }}>#{booking.confirmation}</ReadOnlyValue>
                  </>
                )}
                {booking.cost && (
                  <>
                    <RowLabel>Cost</RowLabel>
                    <ReadOnlyValue>{formatMoney(booking.cost.amount, booking.cost.currency)}</ReadOnlyValue>
                  </>
                )}
              </Row>
            </div>
          )}

          <div>
            <SectionTitle>Notes</SectionTitle>
            <NotesArea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => {
                const next = notes.trim();
                if (next !== (booking.notes ?? '')) {
                  commit({ notes: next || undefined });
                }
              }}
              placeholder="Add your own notes — reservation refs, who's coming, what to bring…"
            />
          </div>

          <Actions>
            <DangerBtn
              type="button"
              onClick={() => {
                deleteBooking(booking.id);
                onCollapse?.();
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <path d="M19 6 18 20a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              </svg>
              Delete
            </DangerBtn>
          </Actions>
        </ExpandedBody>
      </Card>
    );
  }

  /* ── Compact render ──────────────────────────────────────────── */

  return (
    <Card ref={cardRef} $focused={focused} onClick={onClick}>
      <CompactGrid>
        <TimeCol onClick={stopBubble}>
          {hasNoTime ? (
            /* Untimed activities (in-between filler) render nothing
               in the time slot — no "Add time" button, no placeholder.
               The user can still set a time later via the detail
               modal's date+time pickers. */
            null
          ) : (
            (() => {
              /* `hasNoTime` is false here ⇒ booking.start is defined.
                 Pulled into a local so TS narrows it for the rest. */
              const start = booking.start!;
              const startDay = localDateKey(start);
              const endDay = booking.end ? localDateKey(booking.end) : startDay;
              const spans = endDay !== startDay;
              if (spans && dayKey) {
                const labels = multiDayLabels(booking.type);
                if (dayKey === endDay) {
                  return (
                    <>
                      <Time>{formatTimeOfDay(booking.end!)}</Time>
                      <SubTime>{labels.end}</SubTime>
                    </>
                  );
                }
                if (dayKey === startDay) {
                  return (
                    <>
                      <Time>{formatTimeOfDay(start)}</Time>
                      <SubTime>{labels.start}</SubTime>
                    </>
                  );
                }
                return <Time>All day</Time>;
              }
              return (
                <>
                  <Time>{formatTimeOfDay(start)}</Time>
                  {dur && <SubTime>{dur}</SubTime>}
                </>
              );
            })()
          )}
        </TimeCol>
        <BodyCol>
          <Title>
            <IconWrap $type={booking.type}>
              <BookingIcon type={booking.type} />
            </IconWrap>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {booking.title}
            </span>
          </Title>
          <Sub>{bookingSubtitle(booking)}</Sub>
        </BodyCol>
        <Tail>
          {locked && (
            <span
              title="Anchored to a confirmed time — open to edit details"
              aria-label="Locked"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                fontSize: 10.5,
                fontWeight: 600,
                color: 'rgba(36, 36, 36, 0.55)',
                background: 'rgba(36, 36, 36, 0.05)',
                padding: '2px 7px 2px 5px',
                borderRadius: 999,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Locked
            </span>
          )}
          <Pill $tone={booking.source}>
            {booking.source === 'email' ? 'From email' : booking.source}
          </Pill>
          {booking.confirmation && (
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              #{booking.confirmation}
            </span>
          )}
          {booking.cost && (
            <span style={{ color: 'rgba(36,36,36,0.75)', fontWeight: 600 }}>
              {formatMoney(booking.cost.amount, booking.cost.currency)}
            </span>
          )}
        </Tail>
      </CompactGrid>
    </Card>
  );
};

export default BookingCard;
