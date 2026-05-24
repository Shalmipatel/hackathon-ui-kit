import React from 'react';
import styled from 'styled-components';
import type { Booking, BookingType } from './types';
import { formatDuration, formatMoney, formatTimeOfDay, localDateKey } from './format';

const Card = styled.div<{ $focused?: boolean }>`
  display: grid;
  grid-template-columns: 80px 1fr auto;
  gap: 16px;
  align-items: center;
  padding: 14px 16px;
  border-radius: 14px;
  background: #fff;
  border: 1px solid
    ${(p) => (p.$focused ? 'rgba(36, 36, 36, 0.35)' : 'rgba(36, 36, 36, 0.07)')};
  cursor: pointer;
  transition: all 0.15s;
  font-family: 'Inter', sans-serif;
  position: relative;

  &:hover {
    border-color: rgba(36, 36, 36, 0.22);
    box-shadow: 0 2px 8px rgba(36, 36, 36, 0.05);
  }

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

const Body = styled.div`
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
  background: ${(p) =>
    p.$type === 'flight'
      ? 'rgba(56, 189, 248, 0.18)'
      : p.$type === 'hotel'
        ? 'rgba(250, 204, 21, 0.22)'
        : p.$type === 'activity'
          ? 'rgba(168, 85, 247, 0.18)'
          : p.$type === 'restaurant'
            ? 'rgba(248, 113, 113, 0.18)'
            : 'rgba(34, 197, 94, 0.18)'};
`;

function BookingIcon({ type }: { type: BookingType }) {
  switch (type) {
    case 'flight':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
        </svg>
      );
    case 'hotel':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 22V8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14" />
          <path d="M3 17h18" />
          <path d="M7 13h2" />
          <path d="M7 10h2" />
        </svg>
      );
    case 'activity':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3a14.5 14.5 0 0 0 0 18" />
          <path d="M12 3a14.5 14.5 0 0 1 0 18" />
          <path d="M3 12h18" />
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
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="3" width="16" height="16" rx="2" />
          <path d="M4 11h16" />
          <path d="M8 15h.01" />
          <path d="M16 15h.01" />
          <path d="m8 19-2 3" />
          <path d="m16 19 2 3" />
        </svg>
      );
  }
}

function bookingSubtitle(booking: Booking): string {
  switch (booking.type) {
    case 'flight':
      return [
        booking.flightNumber,
        booking.provider,
        `${booking.from.address ?? booking.from.name} → ${booking.to.address ?? booking.to.name}`,
      ]
        .filter(Boolean)
        .join(' · ');
    case 'hotel':
      return [
        booking.place.address ?? booking.place.name,
        booking.nights ? `${booking.nights} night${booking.nights === 1 ? '' : 's'}` : '',
        booking.provider,
      ]
        .filter(Boolean)
        .join(' · ');
    case 'activity':
      return [booking.place.address ?? booking.place.name, booking.provider]
        .filter(Boolean)
        .join(' · ');
    case 'restaurant':
      return [
        booking.place.address ?? booking.place.name,
        booking.partySize ? `Party of ${booking.partySize}` : '',
      ]
        .filter(Boolean)
        .join(' · ');
    case 'transport':
      return [
        booking.mode,
        `${booking.from.name} → ${booking.to.name}`,
        booking.provider,
      ]
        .filter(Boolean)
        .join(' · ');
  }
}

interface BookingCardProps {
  booking: Booking;
  focused?: boolean;
  onClick?: () => void;
  /** YYYY-MM-DD of the day section this card is rendered under. For
   *  multi-day bookings, the time column adapts: start day shows
   *  check-in/departure time, end day shows check-out/arrival time,
   *  middle days show "All day". Omit to fall back to start-time only. */
  dayKey?: string;
}

function multiDayLabels(type: BookingType): { start: string; end: string } {
  switch (type) {
    case 'flight':
    case 'transport':
      return { start: 'Departs', end: 'Arrives' };
    case 'hotel':
      return { start: 'Check-in', end: 'Check-out' };
    case 'activity':
    case 'restaurant':
      return { start: 'Starts', end: 'Ends' };
  }
}

export const BookingCard: React.FC<BookingCardProps> = ({
  booking,
  focused,
  onClick,
  dayKey,
}) => {
  const startDay = localDateKey(booking.start);
  const endDay = booking.end ? localDateKey(booking.end) : startDay;
  const spansDays = endDay !== startDay;

  /* Pick which timestamp to render on THIS day's card. Without dayKey
     or for single-day bookings, keep the old "show start time" behavior. */
  let displayTime = formatTimeOfDay(booking.start);
  let displaySub: string | null = formatDuration(booking.start, booking.end);
  if (spansDays && dayKey) {
    const labels = multiDayLabels(booking.type);
    if (dayKey === endDay) {
      displayTime = formatTimeOfDay(booking.end!);
      displaySub = labels.end;
    } else if (dayKey === startDay) {
      displaySub = labels.start;
    } else {
      displayTime = 'All day';
      displaySub = null;
    }
  }

  return (
    <Card $focused={focused} onClick={onClick}>
      <TimeCol>
        <Time>{displayTime}</Time>
        {displaySub && <SubTime>{displaySub}</SubTime>}
      </TimeCol>
      <Body>
        <Title>
          <IconWrap $type={booking.type}>
            <BookingIcon type={booking.type} />
          </IconWrap>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {booking.title}
          </span>
        </Title>
        <Sub>{bookingSubtitle(booking)}</Sub>
      </Body>
      <Tail>
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
    </Card>
  );
};

export default BookingCard;
