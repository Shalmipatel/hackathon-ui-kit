import React, { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { useTravelStore } from './travel-store';
import {
  bookingDayKey,
  bookingDayKeys,
  formatDayLabel,
  formatTripRange,
  isBookingLocked,
  localDateKey,
  tripDayKeys,
} from './format';
import BookingCard from './BookingCard';
import { useRescanTrip } from './useRescanTrip';
import AddPlaceButton, { type PlaceResult } from './AddPlaceButton';
import type { ActivityBooking, Booking } from './types';
import { toast } from '@/features/toast';

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-width: 0;
  /* Disable browser scroll anchoring inside the itinerary. When the
     source card flips to display:none on drag start, anchoring tries
     to compensate for the layout shift and ends up scrolling the
     page to a different position (the user reported "page jumps to
     top of the day"). We restore the desired scroll position
     manually right after drag start instead. */
  overflow-anchor: none;
  & * { overflow-anchor: none; }
`;

const TripHeader = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 4px 4px 0;
`;

const RescanBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(36, 36, 36, 0.15);
  background: #fff;
  color: #242424;
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 12px;
  padding: 7px 12px;
  border-radius: 9px;
  cursor: pointer;
  transition: all 0.12s;
  flex-shrink: 0;

  &:hover:not(:disabled) {
    background: #242424;
    color: #fff;
    border-color: #242424;
  }

  &:disabled {
    opacity: 0.55;
    cursor: progress;
  }
`;

const HeaderText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
`;

const TripTitle = styled.h2`
  margin: 0;
  font-family: 'Inter', sans-serif;
  font-weight: 600;
  font-size: 24px;
  color: #242424;
  letter-spacing: -0.5px;
  line-height: 30px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const TripMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  color: rgba(36, 36, 36, 0.62);
`;

const Travelers = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(36, 36, 36, 0.06);
  font-size: 11.5px;
  font-weight: 500;
  color: rgba(36, 36, 36, 0.7);
`;

const Section = styled.div<{ $dragOver?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-radius: 14px;
  padding: 6px;
  margin: -6px;
  transition: background 0.12s, box-shadow 0.12s;
  background: ${(p) =>
    p.$dragOver ? 'rgba(33, 104, 105, 0.07)' : 'transparent'};
  box-shadow: ${(p) =>
    p.$dragOver ? 'inset 0 0 0 1px rgba(33, 104, 105, 0.35)' : 'none'};
`;

const DropHint = styled.div<{ $dragOver?: boolean }>`
  margin: 0 0 0 56px;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px dashed
    ${(p) =>
      p.$dragOver ? 'rgba(33, 104, 105, 0.6)' : 'rgba(31, 36, 33, 0.18)'};
  background: ${(p) =>
    p.$dragOver ? 'rgba(33, 104, 105, 0.06)' : 'transparent'};
  color: ${(p) =>
    p.$dragOver ? '#216869' : 'rgba(31, 36, 33, 0.5)'};
  font-size: 12px;
  font-weight: 500;
  text-align: center;
  pointer-events: none;

  @media (max-width: 600px) {
    margin-left: 0;
  }
`;

/** Multi-day items (hotels spanning nights, overnight flights, etc.)
 *  appear in multiple day buckets — registering the SAME id in
 *  multiple SortableContexts confuses dnd-kit and causes the dragged
 *  card to "jump" between day sections mid-drag. Lock them out of
 *  drag entirely; they're effectively immovable in the real world
 *  anyway. */
function bookingSpansMultipleDays(b: Booking): boolean {
  return bookingDayKeys(b).length > 1;
}

/** Each card is registered with a per-day-instance id (`<day>::<bookingId>`)
 *  so multi-day bookings (which appear in 2+ day buckets) don't collide
 *  on the same dnd-kit id across sortable contexts. handleDragEnd
 *  parses these back into a (dayKey, bookingId) pair. */
const composeSortableId = (dayKey: string, bookingId: string) =>
  `${dayKey}::${bookingId}`;
const parseSortableId = (id: string): { dayKey: string; bookingId: string } | null => {
  const idx = id.indexOf('::');
  if (idx === -1) return null;
  return { dayKey: id.slice(0, idx), bookingId: id.slice(idx + 2) };
};

/** Sortable wrapper around a BookingCard. Disabled (no drag affordance,
 *  no listeners) for locked bookings — those are still tappable / open
 *  the modal, just not draggable. dnd-kit's transform is applied via
 *  CSS.Transform.toString so reorder feels natively smooth on both
 *  desktop and touch. */
const SortableItem: React.FC<{
  booking: Booking;
  dayKey: string;
  onBookingClick?: (id: string) => void;
  editing: boolean;
  jiggleIndex: number;
}> = ({ booking, dayKey, onBookingClick, editing, jiggleIndex }) => {
  /* Locked = confirmation-backed OR multi-day. Both render the lock
     pill and skip dnd-kit's drag listeners.
     CRITICAL: locked items are DRAGGABLE-disabled but still
     DROPPABLE — otherwise the user can't drop an unlocked card
     "next to" a confirmed flight/hotel, which silently breaks
     reordering whenever locked items sit between two unlocked ones. */
  const locked = isBookingLocked(booking) || bookingSpansMultipleDays(booking);
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useSortable({
    id: composeSortableId(dayKey, booking.id),
    disabled: { draggable: locked, droppable: false },
  });
  /* `touch-action: manipulation` keeps native vertical scroll
     working when the user swipes a card — the dnd-kit TouchSensor
     still picks up a stationary press for activation (450 ms), so
     the gestures don't collide:
       • quick swipe ⇒ page scrolls
       • tap ⇒ card opens detail modal
       • press + hold 450 ms ⇒ drag activates
     `user-select: none` + `-webkit-touch-callout: none` suppress the
     iOS text selection / callout menu during the long-press wait. */
  /* Jiggle only the unlocked cards while the user is editing. Locked
     cards stay still — their stillness is itself a signal that they
     can't be reordered. Stagger each card's start offset so they
     don't bob in lockstep (looks more "alive"). */
  const animation =
    editing && !locked
      ? `wb-jiggle 0.45s ease-in-out ${(jiggleIndex % 5) * 0.04}s infinite`
      : undefined;
  const style: React.CSSProperties = {
    cursor: locked ? 'default' : 'grab',
    touchAction: 'manipulation',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTouchCallout: 'none',
    position: 'relative',
    display: isDragging ? 'none' : undefined,
    animation,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      data-booking-id={booking.id}
      {...(locked ? {} : attributes)}
      {...(locked ? {} : listeners)}
    >
      <BookingCard
        booking={booking}
        dayKey={dayKey}
        locked={locked}
        onClick={() => onBookingClick?.(booking.id)}
      />
    </div>
  );
};

/** Live insertion indicator. Rendered between cards (or above/below
 *  the day's items) at the predicted drop position. Replaces the
 *  per-card `isOver` hint with a SINGLE indicator that follows the
 *  cursor — clearer, calmer, and matches the way other modern DnD
 *  surfaces (Notion, Linear, Trello columns) handle reorder. */
/* Jiggle animation for unlocked cards while editing — subtle
 * Springboard-style wiggle that signals "you can drag me now"
 * without being visually noisy. Staggered by index so all the cards
 * don't move in lockstep. */
const jiggleKeyframes = `
  @keyframes wb-jiggle {
    0%   { transform: rotate(-0.6deg); }
    50%  { transform: rotate(0.6deg); }
    100% { transform: rotate(-0.6deg); }
  }
`;

/** Floating bottom bar that surfaces while edit mode is active.
 * Cancel reverts pending reorders; Save commits them. */
const EditModeBar = styled.div`
  position: fixed;
  left: 50%;
  bottom: max(20px, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  z-index: 1100;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 14px 10px 16px;
  background: #1f2421;
  color: #fff;
  border-radius: 999px;
  box-shadow: 0 16px 40px rgba(31, 36, 33, 0.28);
  font-family: 'Inter', sans-serif;
  font-size: 13.5px;
  font-weight: 500;
`;

const EditModeCount = styled.span`
  font-weight: 400;
  color: rgba(255, 255, 255, 0.65);
  min-width: 90px;
  text-align: center;
`;

const EditModeBtn = styled.button<{ $primary?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 14px;
  border-radius: 999px;
  border: none;
  cursor: pointer;
  font-family: inherit;
  font-weight: 600;
  font-size: 13px;
  transition: background 0.12s, transform 0.12s;
  background: ${(p) =>
    p.$primary ? '#feeb29' : 'rgba(255, 255, 255, 0.12)'};
  color: ${(p) => (p.$primary ? '#1f2421' : '#fff')};

  &:hover {
    background: ${(p) =>
      p.$primary ? '#fff069' : 'rgba(255, 255, 255, 0.2)'};
  }
  &:active {
    transform: scale(0.97);
  }
`;

/** Floating insertion indicator that follows the cursor.
 *
 *  Rendered as `position: fixed` so it can sit precisely under the
 *  pointer instead of snapping to the gap between two cards (which
 *  the user found confusing because the line ended up "north" of
 *  where they were actually pointing). The X-span is computed from
 *  the target day section's bounds so it visually belongs to that
 *  day. */
const FloatingInsertionLine = styled.div<{
  $top: number;
  $left: number;
  $width: number;
}>`
  position: fixed;
  top: ${(p) => p.$top}px;
  left: ${(p) => p.$left}px;
  width: ${(p) => p.$width}px;
  height: 3px;
  background: #216869;
  border-radius: 2px;
  pointer-events: none;
  z-index: 999;
  box-shadow: 0 0 0 4px rgba(33, 104, 105, 0.12);

  &::before,
  &::after {
    content: '';
    position: absolute;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #216869;
    top: -3.5px;
  }
  &::before { left: -3px; }
  &::after { right: -3px; }
`;

/** Empty-day drop target so the user can drag a card onto a day that
 *  currently has no events. Uses `useDroppable` (NOT `useSortable`)
 *  because this isn't a sortable item — it's a passive drop slot.
 *  Putting it in `SortableContext.items` was confusing
 *  verticalListSortingStrategy (which assumes uniform-height
 *  sortables) and contributing to the "untimed card jumps to top"
 *  bug. */
const EmptyDayDropZone: React.FC<{ dayKey: string; isActive: boolean }> = ({
  dayKey,
  isActive,
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${dayKey}` });
  return (
    <div ref={setNodeRef}>
      <DropHint $dragOver={isOver}>
        {isOver
          ? 'Drop here'
          : isActive
            ? 'Drop here to move to this day'
            : 'Open day · drop a plan here'}
      </DropHint>
    </div>
  );
};

/** Tail drop target rendered AFTER the last sortable item in a day.
 *  Catches drops that land below all items so dragging an item to the
 *  bottom of the day list isn't silently canceled by dnd-kit's lack of
 *  an `over` target in empty space.
 *
 *  Uses `useDroppable` (NOT `useSortable`) so the tail does NOT enter
 *  the SortableContext items list — mixing a 12-36px tail in with
 *  80-120px cards under `verticalListSortingStrategy` was throwing off
 *  the strategy's index math and making untimed cards snap to the top
 *  of the day at drag start. */
const TailDropZone: React.FC<{ dayKey: string; isDraggingNow: boolean }> = ({
  dayKey,
  isDraggingNow,
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: `tail:${dayKey}` });
  return (
    <div
      ref={setNodeRef}
      style={{
        height: isDraggingNow ? 36 : 12,
        margin: isOver ? '4px 0' : '0',
        borderTop: isOver ? '2px dashed rgba(33, 104, 105, 0.7)' : 'none',
        transition: 'height 0.12s, border-top 0.12s',
      }}
      aria-hidden
    />
  );
};

const DayHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 4px;
  font-family: 'Inter', sans-serif;
`;

const DayHeaderSpacer = styled.div`
  flex: 1;
`;

const DayBadge = styled.div<{ $empty?: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 48px;
  padding: 6px 8px;
  background: ${(p) => (p.$empty ? 'rgba(36, 36, 36, 0.04)' : '#242424')};
  color: ${(p) => (p.$empty ? 'rgba(36, 36, 36, 0.5)' : '#fff')};
  border-radius: 10px;
  line-height: 1;
`;

const DayBadgeNum = styled.span`
  font-weight: 700;
  font-size: 18px;
  letter-spacing: -0.5px;
`;

const DayBadgeLabel = styled.span`
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  opacity: 0.7;
  margin-top: 2px;
`;

const DayTitle = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const DayWeekday = styled.div`
  font-weight: 600;
  font-size: 14.5px;
  color: #242424;
  letter-spacing: -0.3px;
`;

const DayEmpty = styled.div`
  font-size: 12px;
  color: rgba(36, 36, 36, 0.4);
`;

const DayItems = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-left: 56px;

  @media (max-width: 600px) {
    padding-left: 0;
  }
`;

const Empty = styled.div`
  padding: 48px 24px;
  text-align: center;
  border-radius: 16px;
  border: 1px dashed rgba(36, 36, 36, 0.15);
  font-family: 'Inter', sans-serif;
  color: rgba(36, 36, 36, 0.55);

  strong {
    display: block;
    color: #242424;
    margin-bottom: 4px;
    font-weight: 600;
  }
`;

interface ItineraryProps {
  focusedBookingId?: string | null;
  onBookingClick?: (bookingId: string) => void;
  /** Fired when the currently expanded card requests collapse —
   *  outside click, Escape, or the close button. Parent should clear
   *  the focused id. */
  onCollapseBooking?: () => void;
  /** Fires as the user scrolls — passes the booking id closest to the
   *  top of the visible area so the map can auto-pan to it. */
  onScrollFocus?: (bookingId: string) => void;
  /** Override the trip this itinerary renders. Defaults to the
   *  travel-store's activeTripId — useful when the host is a list
   *  of trips (e.g. mobile carousel) where each card needs to render
   *  its OWN trip, independent of the global active selection. */
  tripId?: string;
}

export const Itinerary: React.FC<ItineraryProps> = ({
  focusedBookingId,
  onBookingClick,
  onCollapseBooking,
  onScrollFocus,
  tripId,
}) => {
  const storeActiveTripId = useTravelStore((s) => s.activeTripId);
  const effectiveTripId = tripId ?? storeActiveTripId;
  const trips = useTravelStore((s) => s.trips);
  const allBookings = useTravelStore((s) => s.bookings);
  const addBooking = useTravelStore((s) => s.addBooking);
  const upsertBooking = useTravelStore((s) => s.upsertBooking);
  const { rescan, rescanInFlight } = useRescanTrip();

  /* @dnd-kit drag state. activeId is the composite sortable id of the
     booking being dragged ("<day>::<bookingId>") — used to (a) drive
     the in-place transform/lift on the SortableItem, and (b) tell the
     TailDropZone to expand into a visible drop slot during drag. */
  const [activeId, setActiveId] = useState<string | null>(null);

  /* Live pointer position — captured continuously. `cursorPosRef` is
     a ref (sub-frame freshness, no re-render) for handleDragMove /
     handleDragEnd to read. We don't use dnd-kit's DragOverlay, so the
     overlay position is driven directly off these coords via state
     below (updated only during an active drag, to avoid spamming
     re-renders on every mousemove). */
  const cursorPosRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const onMove = (e: PointerEvent | MouseEvent) => {
      cursorPosRef.current = { x: e.clientX, y: e.clientY };
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('mousemove', onMove);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('mousemove', onMove);
    };
  }, []);
  const trip = useMemo(
    () => trips.find((t) => t.id === effectiveTripId) ?? null,
    [trips, effectiveTripId],
  );
  const bookings = useMemo(
    () => {
      const matched = allBookings.filter((b) => b.tripId === effectiveTripId);
      /* Defensive filter — drop any booking missing the core fields
         needed to render. With the new model, `dayKey` is the
         authoritative day binding; `start` is optional. */
      const valid: typeof matched = [];
      const dropped: string[] = [];
      for (const b of matched) {
        if (!b.type || !b.title) {
          dropped.push(b.id);
          continue;
        }
        if (!b.dayKey && !b.start) {
          dropped.push(b.id);
          continue;
        }
        valid.push(b);
      }
      if (dropped.length > 0) {
        console.warn(
          `[itinerary] skipped ${dropped.length} malformed booking(s):`,
          dropped,
        );
      }
      return valid;
    },
    [allBookings, effectiveTripId],
  );

  /* Edit mode: pending position changes the user has dragged around
     but not yet saved. The active drag updates this, Save commits to
     RTDB, Cancel discards it. */
  const [editMode, setEditMode] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<
    Map<string, { dayKey: string; position: number }>
  >(new Map());

  /** Effective dayKey for a booking — pending override wins. */
  const effectiveDayKey = (b: Booking): string => {
    const pending = pendingChanges.get(b.id);
    return pending?.dayKey ?? bookingDayKey(b);
  };
  /** Effective position for a booking ON the given day — accounts for
   *  pending drags AND for multi-day items whose end-day position is
   *  derived from end-time, not start-time. */
  const effectivePosition = (b: Booking, dayKey: string): number => {
    const pending = pendingChanges.get(b.id);
    if (pending && pending.dayKey === dayKey) return pending.position;
    /* Single-day or on its start day → use stored position. */
    if (!b.start || !b.end) return b.position;
    const startDay = bookingDayKey(b);
    const endDay = localDateKey(b.end);
    if (dayKey === startDay) return b.position;
    if (dayKey === endDay) {
      /* End day of a multi-day item: position derived from end time. */
      const m = b.end.match(/T(\d{2}):(\d{2})/);
      if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60;
      return b.position;
    }
    /* Middle day — sort to top as "all day". */
    return 0;
  };

  const days = useMemo(() => (trip ? tripDayKeys(trip) : []), [trip]);
  const bookingsByDay = useMemo(() => {
    const map = new Map<string, typeof bookings>();
    for (const b of bookings) {
      /* If there's a pending drag for this booking, render it in the
         pending day (and ONLY the pending day) — otherwise render it
         in every day its native start/end span covers. */
      const pending = pendingChanges.get(b.id);
      const days = pending ? [pending.dayKey] : bookingDayKeys(b);
      for (const key of days) {
        const list = map.get(key) ?? [];
        list.push(b);
        map.set(key, list);
      }
    }
    /* Sort each day's list by the effective position (pending override
       first, then end-time-on-end-day for multi-day, then stored). */
    for (const [dk, list] of map) {
      list.sort((a, b) => effectivePosition(a, dk) - effectivePosition(b, dk));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings, pendingChanges]);

  /* Stable per-day SortableContext items arrays. Keyed by day so that
     a re-render of Itinerary (e.g. when `activeId` flips at drag start)
     doesn't hand SortableContext a brand-new array reference for every
     day — dnd-kit re-measures on items-prop change, and that mid-drag
     re-measurement was suspected as contributing to the "jump to top"
     glitch on untimed cards. */
  const sortableItemsByDay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const [dk, list] of bookingsByDay) {
      map.set(dk, list.map((b) => composeSortableId(dk, b.id)));
    }
    return map;
  }, [bookingsByDay]);

  /* Build an ActivityBooking from a place picked in the day's
     AddPlaceButton popover. New model: no `start` (untimed by
     default) — user can give it a time later from the detail modal.
     Position appends to the end of the day so freshly-added items
     land below whatever's already there. */
  const handleAddPlace = (dayKey: string, place: PlaceResult) => {
    if (!trip) return;
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const existing = bookingsByDay.get(dayKey) ?? [];
    const maxPos = existing.reduce(
      (m, b) => Math.max(m, effectivePosition(b, dayKey)),
      0,
    );
    const activity: ActivityBooking = {
      id,
      tripId: trip.id,
      type: 'activity',
      title: place.name,
      dayKey,
      position: maxPos + 1000,
      source: 'manual',
      place: {
        name: place.name,
        address: place.address,
        lat: place.lat,
        lng: place.lng,
      },
    };
    addBooking(activity);
    toast({
      title: `Added to ${formatDayLabel(dayKey)}`,
      description: place.name,
      duration: 3500,
    });
  };

  /* ── @dnd-kit handlers ────────────────────────────────────────
     Replaces HTML5 native DnD. PointerSensor + TouchSensor cover
     desktop + iOS Safari (HTML5 drag is unreliable on touch).
     Within-day reorder interpolates a new start time between the
     dragged item's new neighbors; cross-day drops shift the
     booking to the target day (preserving time-of-day). */
  /* Mouse: 4 px slop so a click still opens the detail modal.
     Touch: 700 ms haptic-touch style hold — long enough that
     scrolling NEVER triggers drag even if the finger pauses for a
     beat mid-swipe, and that brief "I'll skim this card" hovers
     never tip into edit mode. Tolerance tight (4 px) so any real
     scroll gesture cancels the activation timer immediately. The
     experience: a deliberate press-and-hold (≈¾ second), then a
     haptic tap when drag arms — the "Force Touch" feel. */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 700, tolerance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /* Collision detection that EXCLUDES the active item from the pool.
   *
   * dnd-kit's built-in `closestCenter` / `closestCorners` compare the
   * active item's collision rect against every droppable's rect — and
   * the active item's OWN droppable rect is in the pool. At drag start
   * the active is, by definition, closest to itself (distance 0), so
   * `over` resolves to `active`, our `activeIdStr === overIdStr` guard
   * fires, and the drop is silently cancelled. Visually the card snaps
   * back to its sorted position — which, for an untimed item
   * (`start: T12:00:00`) in a day full of afternoon bookings, IS the
   * top of the day. That's the "untimed cards jump to top" report.
   *
   * Filtering the active out lets `over` resolve to a real sibling
   * even when the cursor hasn't moved past the active's own rect. */
  const collisionDetection: CollisionDetection = useMemo(
    () => (args) => {
      const { active, droppableContainers } = args;
      const others = droppableContainers.filter((c) => c.id !== active.id);
      return closestCorners({ ...args, droppableContainers: others });
    },
    [],
  );

  /* No-op sortable strategy: siblings DON'T reflow around the
     active item during drag. This is intentional — locked
     cards (flights, hotels) sitting between the active and the
     drop target were blocking the strategy's reflow, making the
     drag feel "stuck". We don't need predictive reflow because
     handleDragEnd places the moved card based on the cursor's
     final Y, not on the strategy's predicted index. */
  const noopStrategy = useMemo(() => () => null, []);

  /* Live insertion preview: where would the drop land RIGHT NOW?
     `index` is the zero-based slot the active card would occupy in
     the day's list (used at drop time to resolve prev/next neighbors).
     `lineY/lineLeft/lineWidth` are pixel coords for the floating
     indicator — recomputed every drag move so the line stays glued
     to the cursor instead of snapping to the in-flow gap between
     cards. */
  const [insertion, setInsertion] = useState<{
    dayKey: string;
    index: number;
    lineY: number;
    lineLeft: number;
    lineWidth: number;
  } | null>(null);

  /* Active drag context driving the floating overlay render. We don't
     use dnd-kit's DragOverlay (couldn't measure the source after
     display:none, which broke its sizing + snap-center modifier) —
     we render the floating card ourselves as a `position: fixed`
     element centered on `overlay.pointer`, sized by the source's
     captured rect. */
  const [overlay, setOverlay] = useState<{
    width: number;
    height: number;
    pointer: { x: number; y: number };
  } | null>(null);

  /** Pure: given the cursor Y and the moved card's id, walk the LIVE
   *  DOM (the source card is `display:none` while dragging so it's
   *  naturally excluded) and return where the drop would land.
   *
   *  The line Y returned here is SNAPPED to a card boundary (top or
   *  bottom of whichever card the cursor is currently over). It's the
   *  Linear/Notion-style "drop indicator" pattern — a clear strip
   *  between cards rather than a floating cursor follower. */
  const computeInsertion = (
    cursorY: number,
    movedId: string,
  ): {
    targetDay: string;
    insertionIndex: number;
    prevBookingId: string | null;
    nextBookingId: string | null;
    lineY: number;
  } | null => {
    /* Day-section closest to the cursor. */
    let targetDay: string | null = null;
    let bestDist = Infinity;
    for (const sec of document.querySelectorAll<HTMLElement>('[data-day-key]')) {
      const dayKey = sec.dataset.dayKey;
      if (!dayKey) continue;
      const r = sec.getBoundingClientRect();
      if (cursorY >= r.top && cursorY <= r.bottom) {
        targetDay = dayKey;
        break;
      }
      const dist = Math.min(Math.abs(cursorY - r.top), Math.abs(cursorY - r.bottom));
      if (dist < bestDist) {
        bestDist = dist;
        targetDay = dayKey;
      }
    }
    if (!targetDay) return null;

    /* Live rects for every visible card in that day (the dragged
       source has display:none and is therefore absent here). */
    type Slot = { bookingId: string; top: number; bottom: number; mid: number };
    const daySlots: Slot[] = [];
    const dayEl = document.querySelector<HTMLElement>(
      `[data-day-key="${targetDay}"]`,
    );
    if (dayEl) {
      for (const el of dayEl.querySelectorAll<HTMLElement>('[data-booking-id]')) {
        const bookingId = el.dataset.bookingId;
        if (!bookingId || bookingId === movedId) continue;
        const r = el.getBoundingClientRect();
        if (r.height === 0) continue;
        daySlots.push({
          bookingId,
          top: r.top,
          bottom: r.bottom,
          mid: r.top + r.height / 2,
        });
      }
      daySlots.sort((a, b) => a.top - b.top);
    }

    if (daySlots.length === 0) {
      /* Empty day — line goes at the day's content top. */
      const dayRect = dayEl?.getBoundingClientRect();
      return {
        targetDay,
        insertionIndex: 0,
        prevBookingId: null,
        nextBookingId: null,
        lineY: dayRect ? dayRect.top + 24 : cursorY,
      };
    }

    /* Snap the line to the top of the card the cursor is over (or to
       the bottom of the last card if the cursor is below them all).
       Splits each card at its mid: top half ⇒ line at card.top
       (insert before this card); bottom half ⇒ line at card.bottom
       (insert after this card). */
    if (cursorY < daySlots[0].top) {
      return {
        targetDay,
        insertionIndex: 0,
        prevBookingId: null,
        nextBookingId: daySlots[0].bookingId,
        lineY: daySlots[0].top,
      };
    }
    for (let i = 0; i < daySlots.length; i++) {
      const slot = daySlots[i];
      if (cursorY <= slot.bottom) {
        if (cursorY < slot.mid) {
          /* Top half ⇒ insert BEFORE this card; line at card top. */
          return {
            targetDay,
            insertionIndex: i,
            prevBookingId: i > 0 ? daySlots[i - 1].bookingId : null,
            nextBookingId: slot.bookingId,
            lineY: slot.top,
          };
        }
        /* Bottom half ⇒ insert AFTER this card; line at card bottom. */
        return {
          targetDay,
          insertionIndex: i + 1,
          prevBookingId: slot.bookingId,
          nextBookingId: i + 1 < daySlots.length ? daySlots[i + 1].bookingId : null,
          lineY: slot.bottom,
        };
      }
    }
    /* Cursor below the last card ⇒ append. */
    const last = daySlots[daySlots.length - 1];
    return {
      targetDay,
      insertionIndex: daySlots.length,
      prevBookingId: last.bookingId,
      nextBookingId: null,
      lineY: last.bottom,
    };
  };

  const handleDragStart = (event: DragStartEvent) => {
    /* First drag implicitly enters edit mode (matches the iPhone
       Springboard pattern: long-press the app and it both wiggles
       AND becomes draggable in one gesture). Stays in edit mode
       across subsequent drags so the user can move multiple cards
       before committing. */
    if (!editMode) setEditMode(true);
    /* Haptic confirmation that the press has committed — a single
       short vibration on Android / any device that exposes the
       Vibration API. iOS Safari ignores it (no JS access to
       CoreHaptics), but the long 700 ms hold already gives the
       user a clear "I'm being deliberate" feel there. */
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(12);
      } catch {
        /* some browsers throw if the call isn't user-gesture-initiated;
           harmless. */
      }
    }
    const activeIdStr = String(event.active.id);
    const parsed = parseSortableId(activeIdStr);
    /* Capture source rect SYNCHRONOUSLY (before the next React commit
       collapses it via display:none) — used both to size the floating
       overlay and to position it. Use the pointer's current position
       as the initial overlay pointer; if we missed a pointermove
       (touch press-and-hold) fall back to the card's center. */
    let width = 0;
    let height = 0;
    let initialCenter = { x: 0, y: 0 };
    if (parsed) {
      const el = document.querySelector<HTMLElement>(
        `[data-day-key="${parsed.dayKey}"] [data-booking-id="${parsed.bookingId}"]`,
      );
      if (el) {
        const r = el.getBoundingClientRect();
        width = r.width;
        height = r.height;
        initialCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
    }
    const pointer = cursorPosRef.current ?? initialCenter;
    setOverlay({ width, height, pointer });
    setActiveId(activeIdStr);

    /* Stop the "page jumps to top of day" bug. When the source
       collapses (display:none) the browser sometimes nudges scroll
       position — auto-anchor compensation, focused-element scroll-
       into-view, scroll-snap re-snap, take your pick. Cheapest
       reliable fix: blur whatever was focused (no scroll-to-focus),
       snapshot every scrollable ancestor's scrollTop now, and
       hard-lock them back for a few frames after the React commit.
       Three frames is enough to outlast the layout-shift fallout
       without trapping the user (subsequent intentional scrolls
       during drag still work, they just don't fire in the first
       16ms × 3 window). */
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const scrollers: Array<{ el: HTMLElement | Window; top: number }> = [
      { el: window, top: window.scrollY },
    ];
    const collectScrollers = (root: HTMLElement | null) => {
      let node: HTMLElement | null = root;
      while (node) {
        if (node.scrollHeight > node.clientHeight + 1) {
          const oy = getComputedStyle(node).overflowY;
          if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') {
            scrollers.push({ el: node, top: node.scrollTop });
          }
        }
        node = node.parentElement;
      }
    };
    collectScrollers(rootRef.current);
    const restore = () => {
      for (const s of scrollers) {
        if (s.el === window) {
          if (window.scrollY !== s.top) window.scrollTo(window.scrollX, s.top);
        } else {
          const el = s.el as HTMLElement;
          if (el.scrollTop !== s.top) el.scrollTop = s.top;
        }
      }
    };
    requestAnimationFrame(() => {
      restore();
      requestAnimationFrame(() => {
        restore();
        requestAnimationFrame(restore);
      });
    });
  };

  const handleDragMove = (event: DragMoveEvent) => {
    const pointer = cursorPosRef.current;
    if (!pointer) return;
    const activeParsed = parseSortableId(String(event.active.id));
    if (!activeParsed) return;

    /* Move overlay to follow cursor (centered on pointer). */
    setOverlay((prev) =>
      prev && prev.pointer.x === pointer.x && prev.pointer.y === pointer.y
        ? prev
        : prev
        ? { ...prev, pointer }
        : prev,
    );

    /* Update the insertion line indicator + slot info for handleDragEnd. */
    const next = computeInsertion(pointer.y, activeParsed.bookingId);
    if (!next) {
      setInsertion(null);
      return;
    }
    const dayEl = document.querySelector<HTMLElement>(
      `[data-day-key="${next.targetDay}"]`,
    );
    const itemsEl = dayEl?.querySelector<HTMLElement>('[data-day-items]');
    const refRect = (itemsEl ?? dayEl)?.getBoundingClientRect();
    if (!refRect) {
      setInsertion(null);
      return;
    }
    setInsertion({
      dayKey: next.targetDay,
      index: next.insertionIndex,
      lineY: next.lineY,
      lineLeft: refRect.left,
      lineWidth: refRect.width,
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active } = event;
    setActiveId(null);
    setInsertion(null);
    setOverlay(null);

    const activeIdStr = String(active.id);
    const activeParsed = parseSortableId(activeIdStr);
    if (!activeParsed) return;
    const moved = bookings.find((b) => b.id === activeParsed.bookingId);
    if (!moved) return;
    if (isBookingLocked(moved) || bookingSpansMultipleDays(moved)) return;

    const pointer = cursorPosRef.current;
    if (!pointer) return;

    const result = computeInsertion(pointer.y, moved.id);
    if (!result) return;
    const { targetDay, prevBookingId, nextBookingId } = result;
    const dayList = bookingsByDay.get(targetDay) ?? [];

    /* Compute new position as midpoint of prev/next effective positions
       on the target day. Edge cases: insert at top = prev null;
       insert at bottom = next null. */
    const prevBooking = prevBookingId
      ? dayList.find((b) => b.id === prevBookingId) ?? null
      : null;
    const nextBooking = nextBookingId
      ? dayList.find((b) => b.id === nextBookingId) ?? null
      : null;
    const prevPos = prevBooking ? effectivePosition(prevBooking, targetDay) : null;
    const nextPos = nextBooking ? effectivePosition(nextBooking, targetDay) : null;
    let newPos: number;
    if (prevPos !== null && nextPos !== null) newPos = (prevPos + nextPos) / 2;
    else if (prevPos !== null) newPos = prevPos + 1000;
    else if (nextPos !== null) newPos = nextPos - 1000;
    else newPos = 43200; // empty day, default to noon-equivalent

    /* Park in pendingChanges — RTDB only gets touched when the user
       hits Save. */
    setPendingChanges((prev) => {
      const next = new Map(prev);
      next.set(moved.id, { dayKey: targetDay, position: newPos });
      return next;
    });
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setInsertion(null);
    setOverlay(null);
  };

  /** Commit pending position changes to RTDB and exit edit mode. */
  const saveEdits = () => {
    if (pendingChanges.size === 0) {
      setEditMode(false);
      return;
    }
    for (const [bookingId, { dayKey, position }] of pendingChanges) {
      const b = bookings.find((x) => x.id === bookingId);
      if (!b) continue;
      const updated: Booking = { ...b, dayKey, position };
      /* If the user moved the booking to a different day AND the item
         has a `start` (timed booking), keep the time-of-day but swap
         the date prefix so the timestamp's day matches dayKey. */
      if (b.start && bookingDayKey(b) !== dayKey) {
        updated.start = dayKey + b.start.slice(10);
        if (b.end) {
          /* Shift end by the same number of calendar days as start
             so multi-day spans don't get torn apart. (Multi-day items
             aren't draggable, so this path is mostly defensive.) */
          const startDayShift =
            new Date(`${dayKey}T00:00:00`).getTime() -
            new Date(`${bookingDayKey(b)}T00:00:00`).getTime();
          const oldEndMs = new Date(b.end).getTime();
          updated.end = new Date(oldEndMs + startDayShift).toISOString();
        }
      }
      upsertBooking(updated);
    }
    const movedCount = pendingChanges.size;
    setPendingChanges(new Map());
    setEditMode(false);
    toast({
      title: movedCount === 1 ? 'Saved 1 change' : `Saved ${movedCount} changes`,
      duration: 2200,
    });
  };

  /** Drop all uncommitted reorders and return to view mode. */
  const cancelEdits = () => {
    setPendingChanges(new Map());
    setEditMode(false);
  };

  /* Scroll-spy: pan the map to whichever booking is currently closest
     to the top of the viewport. Booking cards advertise themselves
     with `data-booking-id`; we observe all of them and report the
     top-most-visible one. The 96px rootMargin top accounts for the
     sticky map's footprint, so a card is considered "active" once
     it scrolls under the map's bottom edge. */
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lastFocusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!onScrollFocus) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const root = rootRef.current;
    if (!root) return;
    const cards = root.querySelectorAll<HTMLElement>('[data-booking-id]');
    if (cards.length === 0) return;

    const intersectingByTop = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.bookingId;
          if (!id) continue;
          if (e.isIntersecting) {
            intersectingByTop.set(id, e.boundingClientRect.top);
          } else {
            intersectingByTop.delete(id);
          }
        }
        if (intersectingByTop.size === 0) return;
        let topId: string | null = null;
        let topY = Infinity;
        for (const [id, y] of intersectingByTop) {
          if (y < topY) {
            topY = y;
            topId = id;
          }
        }
        if (topId && topId !== lastFocusRef.current) {
          lastFocusRef.current = topId;
          onScrollFocus(topId);
        }
      },
      { rootMargin: '-220px 0px -45% 0px', threshold: [0, 0.2, 0.5, 0.8, 1] },
    );
    cards.forEach((c) => observer.observe(c));
    return () => observer.disconnect();
  }, [onScrollFocus, bookings.length, effectiveTripId]);

  if (!trip) {
    return (
      <Empty>
        <strong>No trip selected</strong>
        Pick a trip from the left, or ask the assistant to scan your inbox.
      </Empty>
    );
  }

  return (
    <Wrap ref={rootRef}>
      <TripHeader>
        <HeaderText>
          <TripTitle>{trip.title}</TripTitle>
          <TripMeta>
            {trip.destination}
            <span>·</span>
            {formatTripRange(trip)}
            {trip.travelers && trip.travelers.length > 0 && (
              <Travelers>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                {trip.travelers.join(', ')}
              </Travelers>
            )}
          </TripMeta>
        </HeaderText>
        <RescanBtn
          onClick={() => rescan(trip.id)}
          disabled={rescanInFlight}
          title="Ask the assistant to look for new bookings for this trip"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            <path d="M3 21v-5h5" />
          </svg>
          {rescanInFlight ? 'Rescanning…' : 'Rescan trip'}
        </RescanBtn>
      </TripHeader>

      {bookings.length === 0 ? (
        <Empty>
          <strong>No bookings yet</strong>
          Connect Gmail and ask the assistant to scan for confirmations.
        </Empty>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          {days.map((day, idx) => {
            const dayBookings = bookingsByDay.get(day) ?? [];
            const [, , d] = day.split('-').map(Number);
            const dayLabel = formatDayLabel(day);
            const sortableItems = sortableItemsByDay.get(day) ?? [];
            const isDraggingNow = activeId !== null;
            return (
              <Section key={day} data-day-key={day}>
                <DayHeader>
                  <DayBadge $empty={dayBookings.length === 0}>
                    <DayBadgeNum>{d}</DayBadgeNum>
                    <DayBadgeLabel>
                      {new Date(day).toLocaleString(undefined, { month: 'short' })}
                    </DayBadgeLabel>
                  </DayBadge>
                  <DayTitle>
                    <DayWeekday>Day {idx + 1} · {dayLabel}</DayWeekday>
                    {dayBookings.length === 0 ? (
                      <DayEmpty>Open day</DayEmpty>
                    ) : (
                      <DayEmpty>
                        {dayBookings.length} {dayBookings.length === 1 ? 'item' : 'items'}
                      </DayEmpty>
                    )}
                  </DayTitle>
                  <DayHeaderSpacer />
                  <AddPlaceButton
                    dayLabel={dayLabel}
                    destinationHint={trip.destination}
                    onAdd={(place) => handleAddPlace(day, place)}
                  />
                </DayHeader>
                <SortableContext items={sortableItems} strategy={noopStrategy}>
                  {dayBookings.length > 0 ? (
                    <DayItems data-day-items>
                      {dayBookings.map((b, jiggleIndex) => (
                        <SortableItem
                          key={b.id}
                          booking={b}
                          dayKey={day}
                          onBookingClick={onBookingClick}
                          editing={editMode}
                          jiggleIndex={jiggleIndex}
                        />
                      ))}
                      <TailDropZone dayKey={day} isDraggingNow={isDraggingNow} />
                    </DayItems>
                  ) : (
                    <EmptyDayDropZone dayKey={day} isActive={isDraggingNow} />
                  )}
                </SortableContext>
              </Section>
            );
          })}
          {insertion && (
            <FloatingInsertionLine
              aria-hidden
              $top={insertion.lineY}
              $left={insertion.lineLeft}
              $width={insertion.lineWidth}
            />
          )}
          {activeId && overlay && overlay.width > 0
            ? (() => {
                const parsed = parseSortableId(activeId);
                const b = parsed
                  ? bookings.find((bk) => bk.id === parsed.bookingId)
                  : null;
                if (!b || !parsed) return null;
                return (
                  <FloatingDragCard
                    style={{
                      width: overlay.width,
                      height: overlay.height,
                      left: overlay.pointer.x - overlay.width / 2,
                      top: overlay.pointer.y - overlay.height / 2,
                    }}
                  >
                    <BookingCard booking={b} dayKey={parsed.dayKey} />
                  </FloatingDragCard>
                );
              })()
            : null}
        </DndContext>
      )}
      {editMode && (
        <>
          {/* Inject the jiggle keyframes once, scoped here. */}
          <style>{jiggleKeyframes}</style>
          <EditModeBar role="dialog" aria-label="Reorder mode">
            <EditModeBtn
              type="button"
              onClick={cancelEdits}
              aria-label="Cancel reorder"
            >
              Cancel
            </EditModeBtn>
            <EditModeCount>
              {pendingChanges.size === 0
                ? 'Drag to reorder'
                : pendingChanges.size === 1
                  ? '1 change'
                  : `${pendingChanges.size} changes`}
            </EditModeCount>
            <EditModeBtn
              type="button"
              $primary
              onClick={saveEdits}
              aria-label="Save reorder"
            >
              {pendingChanges.size === 0 ? 'Done' : 'Save'}
            </EditModeBtn>
          </EditModeBar>
        </>
      )}
    </Wrap>
  );
};

/* Floating card while dragging — replaces dnd-kit's `DragOverlay`.
 * Positioned manually via `left/top` derived from the live cursor and
 * the source's captured size, so the card is always centered exactly
 * on the pointer regardless of where on the source the user grabbed.
 * pointer-events: none so it doesn't interfere with drop detection. */
const FloatingDragCard = styled.div`
  position: fixed;
  z-index: 1000;
  pointer-events: none;
  cursor: grabbing;
  border-radius: 14px;
  box-shadow: 0 24px 56px rgba(31, 36, 33, 0.32);
  transform: rotate(-0.6deg);
  will-change: transform, left, top;
`;

export default Itinerary;

/* ── Helpers ───────────────────────────────────────────────────── */

/* Drag drop math is now pure numeric (effectivePosition + midpoint) —
 * the tz-aware interpolation helpers and the cross-day shift helper
 * that lived here are no longer needed. See handleDragEnd / saveEdits
 * in the Itinerary component. */
