import React, { useEffect, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import type { Booking } from './types';
import {
  formatDayLabel,
  formatDuration,
  formatMoney,
  formatTimeOfDay,
  isoTimeOnly,
  replaceIsoDate,
  replaceIsoTime,
} from './format';
import { useTravelStore } from './travel-store';

/**
 * Booking detail modal — read-only externals (confirmation, cost,
 * coords-on-map) + inline-editable user-facing fields (title, date,
 * times, notes). Auto-saves on blur via `upsertBooking` so there's
 * no separate "Save" step; the store re-renders and the parent
 * passes the fresh booking back in on the next tick.
 *
 * Time UX: when `booking.hasTime === false` we hide the formatted
 * time and surface an "+ Add time" affordance. Picking a time flips
 * `hasTime` true and the regular time editor takes over.
 */

const fadeIn = keyframes`
  from { opacity: 0; }
  to   { opacity: 1; }
`;

const slideUp = keyframes`
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
`;

/* Apple-style sheet easing — close to UIKit's spring presentation curve. */
const IOS_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

const Backdrop = styled.div<{ $open: boolean }>`
  position: fixed;
  inset: 0;
  background: rgba(36, 36, 36, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  /* Leaflet's overlay/marker panes go up to z-index 600+ — modal must
     sit above the entire map stack or markers poke through the
     backdrop. */
  z-index: 1000;
  padding: 24px;
  opacity: ${(p) => (p.$open ? 1 : 0)};
  transition: opacity 0.32s ${IOS_EASE};

  @media (max-width: 600px) {
    padding: 0;
    align-items: flex-end;
  }
`;

const Card = styled.div<{ $open: boolean; $dragOffset: number; $dragging: boolean }>`
  background: #fff;
  border-radius: 18px;
  width: min(560px, 100%);
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  font-family: 'Inter', sans-serif;
  box-shadow: 0 24px 60px rgba(36, 36, 36, 0.35);
  /* Desktop: subtle scale-in. Mobile overrides below to use translateY
     for the slide-up + drag-to-dismiss. */
  animation: ${slideUp} 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;

  @media (max-width: 600px) {
    border-radius: 18px 18px 0 0;
    width: 100%;
    max-height: 92vh;
    animation: none;
    /* When dragging → track finger exactly. When at rest (open OR
       closing) → translate to the target. */
    transform: translateY(${(p) =>
      p.$dragging ? `${p.$dragOffset}px` : p.$open ? '0' : '100%'});
    transition: ${(p) =>
      p.$dragging ? 'none' : `transform 0.42s ${IOS_EASE}`};
  }
`;

/* iOS-native grabber: 36×5 visible pill (Apple HIG spec) sitting in a
   44pt-tall touchable region (Apple's minimum touch target). Centered
   so the visible pill stays where the eye expects it while the hit
   area extends comfortably above and below.

   On mobile we also extend the drag region to wrap the entire sheet
   header (handle + title row) so the user doesn't have to land
   precisely on the 5px pill. */
const DragHandle = styled.div`
  display: none;

  @media (max-width: 600px) {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 8px 0;
    touch-action: none;
    cursor: grab;
    &:active { cursor: grabbing; }
    &::after {
      content: '';
      display: block;
      width: 36px;
      height: 5px;
      border-radius: 3px;
      background: rgba(60, 60, 67, 0.3); /* iOS grabber color */
    }
  }
`;

const Head = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 22px 24px 16px;
  border-bottom: 1px solid rgba(36, 36, 36, 0.06);
`;

const HeadIcon = styled.button<{ $tone: string }>`
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${(p) => p.$tone};
  color: #242424;
  border: none;
  cursor: pointer;
  padding: 0;
  position: relative;
  transition: transform 0.12s, box-shadow 0.12s;

  &:hover { box-shadow: 0 2px 8px rgba(36, 36, 36, 0.18); }
  &:active { transform: scale(0.94); }

  /* Subtle chevron hint that this is tappable. */
  &::after {
    content: '';
    position: absolute;
    bottom: 3px;
    right: 4px;
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: #fff;
    box-shadow: 0 0 0 1px rgba(36, 36, 36, 0.18);
  }
`;

const TypePopover = styled.div`
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 20;
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 12px 36px rgba(36, 36, 36, 0.22);
  border: 1px solid rgba(36, 36, 36, 0.08);
  padding: 6px;
  min-width: 200px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px;
`;

const TypeOption = styled.button<{ $active: boolean; $tone: string }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: ${(p) => (p.$active ? p.$tone : 'transparent')};
  border: none;
  border-radius: 9px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: ${(p) => (p.$active ? 600 : 500)};
  color: #1F2421;
  text-align: left;
  text-transform: capitalize;

  &:hover { background: ${(p) => p.$tone}; }
`;

const TypeOptionIcon = styled.span<{ $tone: string }>`
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${(p) => p.$tone};
  color: #1F2421;
`;

const HeadMain = styled.div`
  flex: 1;
  min-width: 0;
`;

const TitleInput = styled.input`
  display: block;
  width: 100%;
  margin: 0;
  padding: 4px 6px;
  border: 1px solid transparent;
  background: transparent;
  font-family: inherit;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.3px;
  color: #1F2421;
  line-height: 24px;
  border-radius: 8px;
  transition: border-color 0.12s, background 0.12s;

  &:hover {
    border-color: rgba(31, 36, 33, 0.12);
  }
  &:focus {
    outline: none;
    border-color: #216869;
    background: #fff;
  }
`;

const HeadSub = styled.div`
  margin-top: 4px;
  font-size: 12.5px;
  color: rgba(36, 36, 36, 0.6);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding-left: 6px;
`;

const SourcePill = styled.span<{ $tone?: 'email' | 'agent' | 'manual' }>`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
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

const Close = styled.button`
  background: transparent;
  border: none;
  cursor: pointer;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(36, 36, 36, 0.55);
  transition: background 0.12s;
  flex-shrink: 0;

  &:hover {
    background: rgba(36, 36, 36, 0.06);
    color: #242424;
  }
`;

const Body = styled.div`
  padding: 20px 24px 24px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
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
  grid-template-columns: 110px 1fr;
  gap: 10px 16px;
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

const AddTimeBtn = styled.button`
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

  &:hover {
    background: rgba(33, 104, 105, 0.08);
    border-style: solid;
  }
`;

const NotesArea = styled.textarea`
  width: 100%;
  min-height: 88px;
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

  &::placeholder {
    color: rgba(31, 36, 33, 0.4);
  }
  &:hover { border-color: rgba(31, 36, 33, 0.28); }
  &:focus { outline: none; border-color: #216869; }
`;

const SourceBlock = styled.div`
  background: #DCE1DE;
  border-radius: 12px;
  padding: 14px 16px;
  font-size: 13px;
  color: rgba(36, 36, 36, 0.85);
  line-height: 19px;
`;

const Footer = styled.div`
  padding: 16px 24px;
  border-top: 1px solid rgba(36, 36, 36, 0.06);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
`;

const Btn = styled.button<{ $variant?: 'danger' | 'ghost' }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid
    ${(p) =>
      p.$variant === 'danger' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(36, 36, 36, 0.18)'};
  background: ${(p) => (p.$variant === 'danger' ? 'rgba(239, 68, 68, 0.06)' : 'transparent')};
  color: ${(p) => (p.$variant === 'danger' ? '#dc2626' : '#242424')};
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 13px;
  padding: 8px 14px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.12s;

  &:hover {
    transform: translateY(-1px);
    background: ${(p) => (p.$variant === 'danger' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(36, 36, 36, 0.04)')};
  }
`;

const TONE: Record<Booking['type'], string> = {
  flight: 'rgba(56, 189, 248, 0.22)',
  hotel: 'rgba(250, 204, 21, 0.28)',
  attraction: 'rgba(217, 119, 6, 0.22)',
  experience: 'rgba(20, 184, 166, 0.22)',
  event: 'rgba(236, 72, 153, 0.22)',
  activity: 'rgba(168, 85, 247, 0.22)',
  restaurant: 'rgba(248, 113, 113, 0.22)',
  transport: 'rgba(73, 160, 120, 0.22)',
};

function typeIcon(type: Booking['type']): React.ReactElement {
  switch (type) {
    case 'flight':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
        </svg>
      );
    case 'hotel':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 22V8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14" />
          <path d="M3 17h18" />
          <path d="M7 13h2" /><path d="M7 10h2" />
        </svg>
      );
    case 'activity':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="14" cy="4" r="2" fill="currentColor" />
          <path d="M16 21l-2-6 1-5 4 4 3 1" />
          <path d="M15 10l-3-1-4 5 2 3" />
          <path d="M8 21l2-4" />
          <path d="M19 3v18" />
        </svg>
      );
    case 'attraction':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      );
    case 'experience':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v3" /><path d="M12 18v3" /><path d="M3 12h3" /><path d="M18 12h3" />
          <path d="m5.6 5.6 2.1 2.1" /><path d="m16.3 16.3 2.1 2.1" />
          <path d="m5.6 18.4 2.1-2.1" /><path d="m16.3 7.7 2.1-2.1" />
        </svg>
      );
    case 'event':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7v3a2 2 0 0 0 0 4v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a2 2 0 0 0 0-4V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" />
          <path d="M13 5v2" /><path d="M13 17v2" /><path d="M13 11v2" />
        </svg>
      );
    case 'restaurant':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 2v7c0 1.7 1.3 3 3 3v10" /><path d="M7 2v20" />
          <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.7 1.3 3 3 3v6" />
        </svg>
      );
    case 'transport':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
          <circle cx="7" cy="17" r="2" />
          <path d="M9 17h6" />
          <circle cx="17" cy="17" r="2" />
        </svg>
      );
  }
}

function whenLineReadOnly(b: Booking): string {
  const dayKey = b.start.slice(0, 10);
  if (b.hasTime === false) return formatDayLabel(dayKey);
  const startTime = formatTimeOfDay(b.start);
  if (!b.end) return `${formatDayLabel(dayKey)} · ${startTime}`;
  const endDayKey = b.end.slice(0, 10);
  const endTime = formatTimeOfDay(b.end);
  if (dayKey === endDayKey) {
    return `${formatDayLabel(dayKey)} · ${startTime} → ${endTime} · ${formatDuration(b.start, b.end)}`;
  }
  return `${formatDayLabel(dayKey)} ${startTime} → ${formatDayLabel(endDayKey)} ${endTime} · ${formatDuration(b.start, b.end)}`;
}

function locationLine(b: Booking): { label: string; address?: string } | null {
  switch (b.type) {
    case 'flight':
    case 'transport':
      return { label: `${b.from.name} → ${b.to.name}` };
    case 'hotel':
    case 'activity':
    case 'attraction':
    case 'experience':
    case 'event':
    case 'restaurant':
      return {
        label: b.place.name,
        address: b.place.address,
      };
  }
}

interface BookingDetailModalProps {
  booking: Booking;
  onClose: () => void;
}

export const BookingDetailModal: React.FC<BookingDetailModalProps> = ({
  booking: b,
  onClose,
}) => {
  const deleteBooking = useTravelStore((s) => s.deleteBooking);
  const upsertBooking = useTravelStore((s) => s.upsertBooking);
  const loc = locationLine(b);

  /* Controlled local state for the editable fields. Re-sync if the
     parent ever swaps the booking out from under us. */
  const [title, setTitle] = useState(b.title);
  const [notes, setNotes] = useState(b.notes ?? '');
  useEffect(() => setTitle(b.title), [b.id, b.title]);
  useEffect(() => setNotes(b.notes ?? ''), [b.id, b.notes]);

  const commit = (patch: Partial<Booking>) => {
    upsertBooking({ ...b, ...patch } as Booking);
  };

  const startDate = b.start.slice(0, 10);
  const startTime = isoTimeOnly(b.start);
  const endDate = b.end?.slice(0, 10) ?? '';
  const endTime = b.end ? isoTimeOnly(b.end) : '';

  const hasNoTime = b.hasTime === false;

  const handleStartDate = (dateKey: string) => {
    if (!dateKey) return;
    commit({ start: replaceIsoDate(b.start, dateKey) });
  };
  const handleStartTime = (time: string) => {
    if (!time) return;
    const [hh, mm] = time.split(':');
    commit({ start: replaceIsoTime(b.start, hh, mm), hasTime: true });
  };
  const handleEndDate = (dateKey: string) => {
    if (!dateKey || !b.end) return;
    commit({ end: replaceIsoDate(b.end, dateKey) });
  };
  const handleEndTime = (time: string) => {
    if (!time || !b.end) return;
    const [hh, mm] = time.split(':');
    commit({ end: replaceIsoTime(b.end, hh, mm) });
  };

  /* Sheet open/closing state powers the slide-up entry + slide-down
     exit animations on mobile. We mount with `open: false` so the
     Card starts at translateY(100%), then flip to `true` on the next
     frame so the CSS transition can interpolate. Closing reverses it
     and defers the actual unmount to the parent until the animation
     completes. */
  const [open, setOpen] = useState(false);
  const closingRef = useRef(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const animatedClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setOpen(false);
    /* Matches the 0.42s transform transition on Card; small extra
       margin so the unmount doesn't snip the tail of the spring. */
    setTimeout(onClose, 440);
  };

  /* Type picker. Only allow swaps WITHIN the same shape-group, since
     flight/transport use from+to and everything else uses place — a
     cross-group switch would mean the new record is missing required
     fields. Most reclassifications (activity→attraction, etc.) live
     within the "place" group, which covers the common case. */
  const [pickerOpen, setPickerOpen] = useState(false);
  const PLACE_TYPES: BookingType[] = [
    'attraction',
    'experience',
    'event',
    'activity',
    'hotel',
    'restaurant',
  ];
  const ROUTE_TYPES: BookingType[] = ['flight', 'transport'];
  const sameGroup = (a: BookingType, b: BookingType): boolean => {
    const isRoute = (t: BookingType) => ROUTE_TYPES.includes(t);
    return isRoute(a) === isRoute(b);
  };
  const availableTypes = ROUTE_TYPES.includes(b.type) ? ROUTE_TYPES : PLACE_TYPES;
  const pickType = (next: BookingType) => {
    setPickerOpen(false);
    if (next === b.type || !sameGroup(b.type, next)) return;
    commit({ type: next } as Partial<Booking>);
  };
  /* Click-outside to close. */
  const headIconWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (headIconWrapRef.current?.contains(t)) return;
      setPickerOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [pickerOpen]);

  /* Mobile drag-to-dismiss state. PointerEvents on the drag handle
     translate the card; release past 80px (Apple's typical dismiss
     threshold) AND/OR with fast downward velocity triggers close.
     Otherwise the card snaps back. Desktop never sees the handle
     (CSS gates it via @media), so these handlers are inert. */
  const dragStartY = useRef<number | null>(null);
  const dragStartTime = useRef<number>(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const onHandleDown = (e: React.PointerEvent) => {
    dragStartY.current = e.clientY;
    dragStartTime.current = performance.now();
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: React.PointerEvent) => {
    if (dragStartY.current === null) return;
    const dy = Math.max(0, e.clientY - dragStartY.current);
    setDragOffset(dy);
  };
  const onHandleUp = () => {
    if (dragStartY.current === null) return;
    const dy = dragOffset;
    const elapsed = Math.max(1, performance.now() - dragStartTime.current);
    const velocity = dy / elapsed; // px / ms
    dragStartY.current = null;
    setDragging(false);
    /* Dismiss if dragged > 80px, OR flicked down faster than ~0.5 px/ms
       (matches the "swipe to dismiss" feel of iOS sheets). */
    if (dy > 80 || velocity > 0.5) {
      animatedClose();
    } else {
      setDragOffset(0);
    }
  };

  return (
    <Backdrop
      $open={open}
      role="dialog"
      aria-modal="true"
      aria-label={`Booking details: ${b.title}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) animatedClose();
      }}
    >
      <Card $open={open} $dragOffset={dragOffset} $dragging={dragging}>
        <DragHandle
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
        />
        <Head>
          <div ref={headIconWrapRef} style={{ position: 'relative', flexShrink: 0 }}>
            <HeadIcon
              $tone={TONE[b.type]}
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              aria-label={`Change booking type, currently ${b.type}`}
              aria-haspopup="menu"
              aria-expanded={pickerOpen}
              title="Tap to change type"
            >
              {typeIcon(b.type)}
            </HeadIcon>
            {pickerOpen && (
              <TypePopover role="menu">
                {availableTypes.map((t) => (
                  <TypeOption
                    key={t}
                    role="menuitemradio"
                    aria-checked={t === b.type}
                    $active={t === b.type}
                    $tone={TONE[t]}
                    onClick={() => pickType(t)}
                  >
                    <TypeOptionIcon $tone={TONE[t]}>
                      {typeIcon(t)}
                    </TypeOptionIcon>
                    {t}
                  </TypeOption>
                ))}
              </TypePopover>
            )}
          </div>
          <HeadMain>
            <TitleInput
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                const next = title.trim();
                if (next && next !== b.title) commit({ title: next });
                else setTitle(b.title);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') {
                  setTitle(b.title);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              aria-label="Title"
            />
            <HeadSub>
              <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>{b.type}</span>
              {b.provider && <span>· {b.provider}</span>}
              <SourcePill $tone={b.source}>
                {b.source === 'email' ? 'From email' : b.source}
              </SourcePill>
            </HeadSub>
          </HeadMain>
          <Close onClick={animatedClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </Close>
        </Head>
        <Body>
          <div>
            <SectionTitle>When</SectionTitle>
            <Row>
              <RowLabel htmlFor={`start-date-${b.id}`}>Starts</RowLabel>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <FieldInput
                  id={`start-date-${b.id}`}
                  type="date"
                  value={startDate}
                  onChange={(e) => handleStartDate(e.target.value)}
                  style={{ maxWidth: 160 }}
                />
                {hasNoTime ? (
                  <AddTimeBtn
                    type="button"
                    onClick={() => {
                      /* Default to noon when the user opens the picker —
                         most browsers' time inputs need a starting value
                         to render the picker UI cleanly. */
                      handleStartTime('12:00');
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    Add time
                  </AddTimeBtn>
                ) : (
                  <FieldInput
                    type="time"
                    value={startTime}
                    onChange={(e) => handleStartTime(e.target.value)}
                    style={{ maxWidth: 130 }}
                  />
                )}
              </div>
              {b.end !== undefined && (
                <>
                  <RowLabel htmlFor={`end-date-${b.id}`}>Ends</RowLabel>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <FieldInput
                      id={`end-date-${b.id}`}
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
                  </div>
                </>
              )}
              {!hasNoTime && (
                <>
                  <RowLabel>Summary</RowLabel>
                  <ReadOnlyValue style={{ color: 'rgba(31,36,33,0.65)', fontWeight: 400 }}>
                    {whenLineReadOnly(b)}
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

          {(b.confirmation || b.cost ||
            (b.type === 'flight' && (b.flightNumber || b.cabin)) ||
            (b.type === 'transport' && b.mode) ||
            (b.type === 'hotel' && b.nights) ||
            (b.type === 'restaurant' && b.partySize)) && (
            <div>
              <SectionTitle>Details</SectionTitle>
              <Row>
                {b.type === 'flight' && b.flightNumber && (
                  <>
                    <RowLabel>Flight</RowLabel>
                    <ReadOnlyValue>{b.flightNumber}</ReadOnlyValue>
                  </>
                )}
                {b.type === 'flight' && b.cabin && (
                  <>
                    <RowLabel>Cabin</RowLabel>
                    <ReadOnlyValue>{b.cabin}</ReadOnlyValue>
                  </>
                )}
                {b.type === 'transport' && b.mode && (
                  <>
                    <RowLabel>Mode</RowLabel>
                    <ReadOnlyValue>{b.mode}</ReadOnlyValue>
                  </>
                )}
                {b.type === 'hotel' && b.nights && (
                  <>
                    <RowLabel>Nights</RowLabel>
                    <ReadOnlyValue>{b.nights}</ReadOnlyValue>
                  </>
                )}
                {b.type === 'restaurant' && b.partySize && (
                  <>
                    <RowLabel>Party</RowLabel>
                    <ReadOnlyValue>{b.partySize}</ReadOnlyValue>
                  </>
                )}
                {b.confirmation && (
                  <>
                    <RowLabel>Confirmation</RowLabel>
                    <ReadOnlyValue style={{ fontFamily: 'ui-monospace, monospace' }}>#{b.confirmation}</ReadOnlyValue>
                  </>
                )}
                {b.cost && (
                  <>
                    <RowLabel>Cost</RowLabel>
                    <ReadOnlyValue>{formatMoney(b.cost.amount, b.cost.currency)}</ReadOnlyValue>
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
                /* Commit even when empty, so the user can clear notes. */
                if (next !== (b.notes ?? '')) {
                  commit({ notes: next || undefined });
                }
              }}
              placeholder="Add your own notes — reservation refs, who's coming, what to bring…"
            />
          </div>

          {b.emailSubject && (
            <div>
              <SectionTitle>Source — Gmail</SectionTitle>
              <SourceBlock>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>{b.emailSubject}</div>
                <div style={{ fontSize: 11.5, color: 'rgba(36,36,36,0.55)' }}>
                  Parsed from your inbox.
                </div>
              </SourceBlock>
            </div>
          )}

          {b.source === 'agent' && !b.emailSubject && (
            <div>
              <SectionTitle>Source — Assistant</SectionTitle>
              <SourceBlock>
                Added by the assistant based on your chat conversation.
              </SourceBlock>
            </div>
          )}
        </Body>
        <Footer>
          <Btn $variant="danger" onClick={() => { deleteBooking(b.id); onClose(); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <path d="M19 6 18 20a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            </svg>
            Delete booking
          </Btn>
          <Btn onClick={animatedClose}>Done</Btn>
        </Footer>
      </Card>
    </Backdrop>
  );
};

export default BookingDetailModal;
