import React, { useEffect, useMemo, useRef } from 'react';
import styled from 'styled-components';
import { useTravelStore } from './travel-store';
import {
  bookingDayKeys,
  formatDayLabel,
  formatTripRange,
  tripDayKeys,
} from './format';
import BookingCard from './BookingCard';
import { useRescanTrip } from './useRescanTrip';

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

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const DayHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 4px;
  font-family: 'Inter', sans-serif;
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
  /** Fires as the user scrolls — passes the booking id closest to the
   *  top of the visible area so the map can auto-pan to it. */
  onScrollFocus?: (bookingId: string) => void;
}

export const Itinerary: React.FC<ItineraryProps> = ({
  focusedBookingId,
  onBookingClick,
  onScrollFocus,
}) => {
  const activeTripId = useTravelStore((s) => s.activeTripId);
  const trips = useTravelStore((s) => s.trips);
  const allBookings = useTravelStore((s) => s.bookings);
  const { rescan, rescanInFlight } = useRescanTrip();
  const trip = useMemo(
    () => trips.find((t) => t.id === activeTripId) ?? null,
    [trips, activeTripId],
  );
  const bookings = useMemo(
    () =>
      allBookings
        .filter((b) => b.tripId === activeTripId)
        .sort(
          (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
        ),
    [allBookings, activeTripId],
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
    return map;
  }, [bookings]);

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
  }, [onScrollFocus, bookings.length, activeTripId]);

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
        days.map((day, idx) => {
          const dayBookings = bookingsByDay.get(day) ?? [];
          const [, m, d] = day.split('-').map(Number);
          const dayLabel = formatDayLabel(day);
          return (
            <Section key={day}>
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
              </DayHeader>
              {dayBookings.length > 0 && (
                <DayItems>
                  {dayBookings.map((b) => (
                    /* data-booking-id is what the scroll-spy
                       IntersectionObserver reads. Keep this attribute
                       in sync with the booking key. */
                    <div key={b.id} data-booking-id={b.id}>
                      <BookingCard
                        booking={b}
                        dayKey={day}
                        focused={b.id === focusedBookingId}
                        onClick={() => onBookingClick?.(b.id)}
                      />
                    </div>
                  ))}
                </DayItems>
              )}
            </Section>
          );
        })
      )}
    </Wrap>
  );
};

export default Itinerary;
