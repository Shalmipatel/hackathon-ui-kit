import React, { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import {
  DndContext,
  DragOverlay,
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
  type Modifier,
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
}> = ({ booking, dayKey, onBookingClick }) => {
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
  /* Dragged card renders only in the top-level `DragOverlay`. The
     source DOM node is fully removed from layout (display:none) so
     surrounding cards collapse the gap — the floating overlay is
     the only on-screen representation while dragging. Insertion math
     reads live DOM positions, so the collapsed layout is what
     determines the drop target (matches what the user sees). */
  const style: React.CSSProperties = {
    cursor: locked ? 'default' : 'grab',
    touchAction: 'manipulation',
    position: 'relative',
    display: isDragging ? 'none' : undefined,
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

  /* Live cursor Y position — captured continuously so handleDragEnd
     can ignore dnd-kit's `over` (which is unreliable for variable-
     height cards) and just find which DOM card the cursor is on top of
     at drop time. This is the actual fix for "untimed cards land in
     the wrong place": insertion is now driven by the cursor, not by
     verticalListSortingStrategy's index math. */
  const cursorYRef = useRef<number | null>(null);
  useEffect(() => {
    const onMove = (e: PointerEvent | MouseEvent) => {
      cursorYRef.current = e.clientY;
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
      /* Defensive filter — drop any booking missing the required scalar
         fields. RTDB writes from the agent skill sometimes land without
         a `start` (or a `type` / `title`), which crashes downstream
         day-bucketing. Filtering here keeps the whole view alive
         instead of taking out TripMap + Itinerary together. */
      const valid: typeof matched = [];
      const dropped: string[] = [];
      for (const b of matched) {
        if (!b.type || !b.title || typeof b.start !== 'string' || !b.start) {
          dropped.push(b.id);
          continue;
        }
        valid.push(b);
      }
      if (dropped.length > 0) {
        console.warn(
          `[itinerary] skipped ${dropped.length} malformed booking(s) missing start/type/title:`,
          dropped,
        );
      }
      return valid.sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      );
    },
    [allBookings, effectiveTripId],
  );

  const days = useMemo(() => (trip ? tripDayKeys(trip) : []), [trip]);
  const bookingsByDay = useMemo(() => {
    const map = new Map<string, typeof bookings>();
    bookings.forEach((b) => {
      /* Multi-day bookings (hotels, multi-day activities) get bucketed
         into every day they cover so the user sees them on each day's
         section, not just the start day. */
      for (const key of bookingDayKeys(b)) {
        const list = map.get(key) ?? [];
        list.push(b);
        map.set(key, list);
      }
    });
    /* Per-day sort: each event uses the timestamp RELEVANT to THIS day,
       not its globally-sorted start. So a hotel that started Day 1 at
       3pm sorts as 11am "Check-out" on Day 5, not as if it began 3pm
       on Day 5 (which would push it after a 10am museum visit). */
    const dayKeyForSort = (b: typeof bookings[number], dk: string): string => {
      const sd = localDateKey(b.start);
      const ed = b.end ? localDateKey(b.end) : sd;
      if (sd === ed) return b.start; // single-day
      if (dk === sd) return b.start; // start day — use start time
      if (dk === ed) return b.end as string; // end day — use end time
      return `${dk}T00:00:00`; // middle day — "All day" sorts to top
    };
    for (const [dk, list] of map) {
      list.sort((a, b) => dayKeyForSort(a, dk).localeCompare(dayKeyForSort(b, dk)));
    }
    return map;
  }, [bookings]);

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
     AddPlaceButton popover. Noon-local timestamp keeps it sorting in
     the middle of any existing bookings on that day without requiring
     the user to pick a time. */
  const handleAddPlace = (dayKey: string, place: PlaceResult) => {
    if (!trip) return;
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const activity: ActivityBooking = {
      id,
      tripId: trip.id,
      type: 'activity',
      title: place.name,
      /* Noon is just a sort-stable placeholder — `hasTime: false` is
         what tells the UI to render an "Add time" affordance instead
         of the literal "12:00 PM". */
      start: `${dayKey}T12:00:00`,
      hasTime: false,
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
  /* Mouse: a 4 px slop avoids stealing single-click events from the
     underlying card (which opens the detail modal). Touch: a 200 ms
     long-press is the iOS standard for "this is a drag, not a tap"
     and matches the cadence of native reorder UI (Reminders, Photos).
     `tolerance` lets the finger drift up to 8 px during the press
     without cancelling. */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
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

  /** Pure: given the cursor Y and the moved card's id, walk the LIVE
   *  DOM (the source card is `display:none` while dragging so it's
   *  naturally excluded) and return where the drop would land.
   *
   *  Live reads — not a drag-start snapshot — because we collapse the
   *  source out of layout: surrounding cards shift up to fill the
   *  gap, and the snapshot would be wrong about their positions. */
  const computeInsertion = (
    cursorY: number,
    movedId: string,
  ): {
    targetDay: string;
    insertionIndex: number;
    prevBookingId: string | null;
    nextBookingId: string | null;
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
    type Slot = { bookingId: string; top: number; mid: number };
    const daySlots: Slot[] = [];
    const dayEl = document.querySelector<HTMLElement>(
      `[data-day-key="${targetDay}"]`,
    );
    if (dayEl) {
      for (const el of dayEl.querySelectorAll<HTMLElement>('[data-booking-id]')) {
        const bookingId = el.dataset.bookingId;
        if (!bookingId || bookingId === movedId) continue;
        const r = el.getBoundingClientRect();
        if (r.height === 0) continue; // skip display:none / un-rendered nodes
        daySlots.push({ bookingId, top: r.top, mid: r.top + r.height / 2 });
      }
      daySlots.sort((a, b) => a.top - b.top);
    }

    if (daySlots.length === 0) {
      return { targetDay, insertionIndex: 0, prevBookingId: null, nextBookingId: null };
    }
    if (cursorY < daySlots[0].mid) {
      return {
        targetDay,
        insertionIndex: 0,
        prevBookingId: null,
        nextBookingId: daySlots[0].bookingId,
      };
    }
    if (cursorY >= daySlots[daySlots.length - 1].mid) {
      return {
        targetDay,
        insertionIndex: daySlots.length,
        prevBookingId: daySlots[daySlots.length - 1].bookingId,
        nextBookingId: null,
      };
    }
    for (let i = 0; i < daySlots.length - 1; i++) {
      if (cursorY >= daySlots[i].mid && cursorY < daySlots[i + 1].mid) {
        return {
          targetDay,
          insertionIndex: i + 1,
          prevBookingId: daySlots[i].bookingId,
          nextBookingId: daySlots[i + 1].bookingId,
        };
      }
    }
    return null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragMove = (event: DragMoveEvent) => {
    const cursorY = cursorYRef.current;
    if (cursorY === null) return;
    const activeParsed = parseSortableId(String(event.active.id));
    if (!activeParsed) return;
    const next = computeInsertion(cursorY, activeParsed.bookingId);
    if (!next) {
      setInsertion(null);
      return;
    }
    /* Line width: span the day section's `DayItems` content area
       (which is indented under the day badge on desktop). Fall back
       to the section bounds if the items column isn't found. */
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
      lineY: cursorY,
      lineLeft: refRect.left,
      lineWidth: refRect.width,
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active } = event;
    setActiveId(null);
    setInsertion(null);

    const activeIdStr = String(active.id);
    const activeParsed = parseSortableId(activeIdStr);
    if (!activeParsed) return;
    const moved = bookings.find((b) => b.id === activeParsed.bookingId);
    if (!moved) return;
    if (isBookingLocked(moved) || bookingSpansMultipleDays(moved)) return;

    const cursorY = cursorYRef.current;
    if (cursorY === null) return;

    const result = computeInsertion(cursorY, moved.id);
    if (!result) return;
    const { targetDay, prevBookingId, nextBookingId } = result;
    const dayList = bookingsByDay.get(targetDay) ?? [];
    const prev = prevBookingId
      ? dayList.find((b) => b.id === prevBookingId) ?? null
      : null;
    const next = nextBookingId
      ? dayList.find((b) => b.id === nextBookingId) ?? null
      : null;

    const sourceDay = activeParsed.dayKey;

    if (sourceDay === targetDay) {
      if (!prev && !next) return;
      const newStart = computeInterpolatedStart(targetDay, moved, prev, next);
      if (newStart === moved.start) return;
      upsertBooking({ ...moved, start: newStart } as Booking);
    } else {
      const shifted = shiftBookingToDay(moved, targetDay);
      const finalStart = prev || next
        ? computeInterpolatedStart(targetDay, shifted, prev, next)
        : shifted.start;
      upsertBooking({ ...shifted, start: finalStart } as Booking);
      toast({
        title: `Moved to ${formatDayLabel(targetDay)}`,
        description: moved.title,
        duration: 3000,
      });
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setInsertion(null);
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
                      {dayBookings.map((b) => (
                        <SortableItem
                          key={b.id}
                          booking={b}
                          dayKey={day}
                          onBookingClick={onBookingClick}
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
          <DragOverlay
            dropAnimation={{ duration: 220, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' }}
            zIndex={1000}
            modifiers={[snapCenterToCursor]}
          >
            {activeId
              ? (() => {
                  const parsed = parseSortableId(activeId);
                  const b = parsed
                    ? bookings.find((bk) => bk.id === parsed.bookingId)
                    : null;
                  if (!b || !parsed) return null;
                  return (
                    <div
                      style={{
                        transform: 'rotate(-0.6deg)',
                        boxShadow: '0 24px 56px rgba(31, 36, 33, 0.32)',
                        borderRadius: 14,
                        cursor: 'grabbing',
                      }}
                    >
                      <BookingCard booking={b} dayKey={parsed.dayKey} />
                    </div>
                  );
                })()
              : null}
          </DragOverlay>
        </DndContext>
      )}
    </Wrap>
  );
};

/* DragOverlay modifier: re-centers the floating card on the cursor.
 * Without this, dnd-kit anchors the overlay to wherever the pointer
 * first landed on the card — grab the top edge and the card hovers
 * "north" of your finger for the rest of the drag, which is what
 * was making the overlay feel detached from the cursor. */
const snapCenterToCursor: Modifier = ({
  activatorEvent,
  draggingNodeRect,
  transform,
}) => {
  if (!draggingNodeRect || !activatorEvent) return transform;
  const pointer = activatorEvent as PointerEvent | MouseEvent | TouchEvent;
  let pointerX: number | null = null;
  let pointerY: number | null = null;
  if ('clientX' in pointer && 'clientY' in pointer) {
    pointerX = pointer.clientX;
    pointerY = pointer.clientY;
  } else if ('touches' in pointer && pointer.touches[0]) {
    pointerX = pointer.touches[0].clientX;
    pointerY = pointer.touches[0].clientY;
  }
  if (pointerX === null || pointerY === null) return transform;
  const offsetX = pointerX - draggingNodeRect.left;
  const offsetY = pointerY - draggingNodeRect.top;
  return {
    ...transform,
    x: transform.x + offsetX - draggingNodeRect.width / 2,
    y: transform.y + offsetY - draggingNodeRect.height / 2,
  };
};

export default Itinerary;

/* ── Helpers ───────────────────────────────────────────────────── */

/** Shift a booking onto a different day, preserving time-of-day and
 *  total duration. Works on any booking type (single or multi-day):
 *
 *    activity 2026-06-15T14:30 → drop on 06-17 → 2026-06-17T14:30
 *    hotel 06-15T15:00 → 06-17T11:00 (2nt), drop start on 06-20
 *      → 06-20T15:00 → 06-22T11:00 (still 2nt)
 *
 *  Implementation: replace the YYYY-MM-DD prefix on `start`, then
 *  shift `end` (if present) by the same number of calendar days so
 *  the span survives the move.
 */
/** Extract the tz suffix from a single ISO string, or empty if naïve. */
function isoTzSuffix(iso: string | undefined): string {
  if (!iso) return '';
  const m = iso.match(/(Z|[+-]\d{2}:\d{2})$/);
  return m ? m[1] : '';
}

/** Tz suffix for the timestamp that REPRESENTS this booking on the
 *  given day. Mirrors `effMs` — for a multi-day item on its END day
 *  we want the end timestamp's tz (e.g. ZRH arrival "+02:00"), not
 *  the start timestamp's tz (which might be a SFO departure
 *  "-07:00"). Mixing them is what was tagging dropped cards with the
 *  wrong offset and silently mis-sorting them. */
function effTzSuffix(b: Booking | null | undefined, dayKey: string): string {
  if (!b) return '';
  const sd = b.start.slice(0, 10);
  const ed = b.end ? b.end.slice(0, 10) : sd;
  if (dayKey === ed && ed !== sd && b.end) return isoTzSuffix(b.end);
  return isoTzSuffix(b.start);
}

/** Pick the FIRST tz suffix from a list of (booking, dayKey) pairs.
 *  Used to format an interpolated timestamp in the same offset as its
 *  neighbors so that string-sort agrees with chronological order. */
function pickTzSuffix(
  dayKey: string,
  ...bookings: Array<Booking | null | undefined>
): string {
  for (const b of bookings) {
    const tz = effTzSuffix(b, dayKey);
    if (tz) return tz;
  }
  return '';
}

/** Format `ms` as HH:MM under a specific UTC offset (or local time if
 *  `offset` is empty). Returns a two-tuple [hh, mm]. */
function hhmmInOffset(ms: number, offset: string): [string, string] {
  let hh: number, mm: number;
  if (offset === '') {
    const d = new Date(ms);
    hh = d.getHours();
    mm = d.getMinutes();
  } else if (offset === 'Z') {
    const d = new Date(ms);
    hh = d.getUTCHours();
    mm = d.getUTCMinutes();
  } else {
    const sign = offset[0] === '-' ? -1 : 1;
    const [oh, om] = offset.slice(1).split(':').map(Number);
    const offsetMs = sign * (oh * 60 + om) * 60 * 1000;
    const d = new Date(ms + offsetMs);
    hh = d.getUTCHours();
    mm = d.getUTCMinutes();
  }
  return [String(hh).padStart(2, '0'), String(mm).padStart(2, '0')];
}

/** Compute a new ISO start timestamp that places `moved` between
 *  `prev` and `next` in the day's chronological list. Both neighbors
 *  are optional (first or last slot). Always returns an ISO string
 *  whose YYYY-MM-DD prefix matches `dayKey` so the booking buckets
 *  back into the right day. `hasTime: false` items keep their
 *  hasTime flag — the parent should preserve that on upsert.
 *
 *  CRITICAL: the returned string is formatted in the same tz offset
 *  as the neighbors (e.g. "+02:00" for a Zurich day) so that the
 *  string-based sort in `bookingsByDay` agrees with chronology. */
function computeInterpolatedStart(
  dayKey: string,
  moved: Booking,
  prev: Booking | null,
  next: Booking | null,
): string {
  /* Effective ms-since-epoch for sorting. For multi-day spans this
     day might be the end day → use end. Untimed items just use start. */
  const effMs = (b: Booking): number => {
    const sd = b.start.slice(0, 10);
    const ed = b.end ? b.end.slice(0, 10) : sd;
    if (dayKey === ed && ed !== sd) return new Date(b.end as string).getTime();
    return new Date(b.start).getTime();
  };
  /* Pick the tz suffix from the neighbors — prefer prev, then next,
     and fall back to whatever `moved` itself uses. Crucially, use the
     END timestamp's tz when a multi-day neighbor is on its end day
     (so a Zurich-arrival flight tags the new card "+02:00" not the
     SFO-departure "-07:00"). */
  const offset = pickTzSuffix(dayKey, prev, next, moved);
  const dayMidnightMs = new Date(`${dayKey}T00:00:00${offset || ''}`).getTime();
  const dayEndMs = dayMidnightMs + 24 * 60 * 60 * 1000 - 1;
  const prevMs = prev ? effMs(prev) : dayMidnightMs;
  const nextMs = next ? effMs(next) : dayEndMs;
  /* Land halfway between neighbors. If both ends are open use noon. */
  let pickedMs: number;
  if (prev && next) pickedMs = (prevMs + nextMs) / 2;
  else if (next) pickedMs = nextMs - 60 * 60 * 1000; // 1h before next
  else if (prev) pickedMs = prevMs + 60 * 60 * 1000; // 1h after prev
  else pickedMs = dayMidnightMs + 12 * 60 * 60 * 1000; // noon

  const [hh, mm] = hhmmInOffset(pickedMs, offset);
  return `${dayKey}T${hh}:${mm}:00${offset}`;
}

function shiftBookingToDay(booking: Booking, newDayKey: string): Booking {
  const oldDayKey = booking.start.slice(0, 10);
  if (oldDayKey === newDayKey) return booking;
  const newStart = newDayKey + booking.start.slice(10);
  let newEnd: string | undefined = booking.end;
  if (booking.end) {
    const oldEndDay = booking.end.slice(0, 10);
    const [oy, om, od] = oldDayKey.split('-').map(Number);
    const [oey, oem, oed] = oldEndDay.split('-').map(Number);
    const [ny, nm, nd] = newDayKey.split('-').map(Number);
    /* Day count between old start day and old end day, computed via
       Date arithmetic so a month boundary doesn't trip us up. */
    const oldStartTs = new Date(oy, om - 1, od).getTime();
    const oldEndTs = new Date(oey, oem - 1, oed).getTime();
    const dayDelta = Math.round((oldEndTs - oldStartTs) / 86_400_000);
    const newEndDate = new Date(ny, nm - 1, nd + dayDelta);
    const newEndDayKey = `${newEndDate.getFullYear()}-${String(
      newEndDate.getMonth() + 1,
    ).padStart(2, '0')}-${String(newEndDate.getDate()).padStart(2, '0')}`;
    newEnd = newEndDayKey + booking.end.slice(10);
  }
  return { ...booking, start: newStart, end: newEnd } as Booking;
}
