import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { useTravelStore } from './travel-store';
import { formatTripRange } from './format';

const Rail = styled.aside`
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px;
  overflow-y: auto;

  @media (max-width: 1100px) {
    width: 240px;
  }
  @media (max-width: 900px) {
    width: 100%;
    flex-direction: row;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 8px;
  }
`;

const RailHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px 0;
  font-family: 'Inter', sans-serif;
  font-weight: 700;
  font-size: 13px;
  color: rgba(36, 36, 36, 0.75);
  letter-spacing: -0.3px;

  @media (max-width: 900px) {
    display: none;
  }
`;

const NewBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 12px;
  color: #242424;
  padding: 4px 6px;
  border-radius: 6px;

  &:hover {
    background: rgba(36, 36, 36, 0.05);
  }
`;

const Card = styled.button<{ $active: boolean; $accent: string }>`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  text-align: left;
  padding: 14px 14px 14px 18px;
  background: ${(p) => (p.$active ? '#fff' : 'rgba(255,255,255,0.55)')};
  border: 1px solid
    ${(p) => (p.$active ? 'rgba(36, 36, 36, 0.18)' : 'rgba(36, 36, 36, 0.07)')};
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.15s;
  overflow: hidden;
  font-family: 'Inter', sans-serif;

  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 8px;
    bottom: 8px;
    width: 4px;
    border-radius: 0 4px 4px 0;
    background: ${(p) => p.$accent};
    opacity: ${(p) => (p.$active ? 1 : 0.55)};
  }

  &:hover {
    background: #fff;
    border-color: rgba(36, 36, 36, 0.18);
  }

  @media (max-width: 900px) {
    min-width: 200px;
    flex-shrink: 0;
  }
`;

const Title = styled.div`
  font-weight: 600;
  font-size: 15px;
  color: #242424;
  letter-spacing: -0.3px;
  line-height: 20px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Dest = styled.div`
  font-size: 12.5px;
  color: rgba(36, 36, 36, 0.7);
  line-height: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Meta = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
  font-size: 11.5px;
  font-weight: 500;
  color: rgba(36, 36, 36, 0.55);
`;

const CountChip = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(36, 36, 36, 0.06);
  font-size: 10.5px;
  font-weight: 600;
  color: rgba(36, 36, 36, 0.65);
`;

/* "..." button revealed on hover. Sits in the top-right of the card and
   opens a small popover with destructive actions. */
const MenuBtn = styled.button`
  position: absolute;
  top: 8px;
  right: 8px;
  background: transparent;
  border: none;
  cursor: pointer;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(36, 36, 36, 0.45);
  opacity: 0;
  transition: all 0.12s;

  &:hover {
    background: rgba(36, 36, 36, 0.08);
    color: #242424;
  }
`;

const CardWithMenu = styled.div`
  position: relative;
  &:hover ${MenuBtn}, &[data-menu-open='true'] ${MenuBtn} {
    opacity: 1;
  }
`;

const Popover = styled.div`
  position: absolute;
  top: 36px;
  right: 8px;
  z-index: 30;
  min-width: 156px;
  background: #1a1a1a;
  border-radius: 10px;
  padding: 6px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.3);
`;

const PopoverItem = styled.button<{ $danger?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: ${(p) => (p.$danger ? '#fca5a5' : '#fff')};
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    color: ${(p) => (p.$danger ? '#fff' : '#fff')};
  }
`;

interface TripListProps {
  onCreateTrip?: () => void;
}

export const TripList: React.FC<TripListProps> = ({ onCreateTrip }) => {
  const trips = useTravelStore((s) => s.trips);
  const activeTripId = useTravelStore((s) => s.activeTripId);
  const setActiveTrip = useTravelStore((s) => s.setActiveTrip);
  const bookings = useTravelStore((s) => s.bookings);
  const deleteTrip = useTravelStore((s) => s.deleteTrip);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);

  /* Close the popover on outside click. Effect is scoped to the open
     state so we don't add a global listener when nothing's open. */
  useEffect(() => {
    if (!menuOpenId) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) return;
      const target = e.target as HTMLElement;
      if (!target.closest('[data-trip-menu]')) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpenId]);

  return (
    <Rail ref={(el) => { containerRef.current = el; }}>
      <RailHeader>
        Trips
        {onCreateTrip && (
          <NewBtn onClick={onCreateTrip} title="New trip">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New
          </NewBtn>
        )}
      </RailHeader>
      {trips.map((trip) => {
        const count = bookings.filter((b) => b.tripId === trip.id).length;
        const menuOpen = menuOpenId === trip.id;
        return (
          <CardWithMenu key={trip.id} data-menu-open={menuOpen}>
            <Card
              $active={trip.id === activeTripId}
              $accent={trip.color}
              onClick={() => setActiveTrip(trip.id)}
            >
              <Title>{trip.title}</Title>
              <Dest>{trip.destination}</Dest>
              <Meta>
                {formatTripRange(trip)}
                <CountChip>{count} {count === 1 ? 'item' : 'items'}</CountChip>
              </Meta>
            </Card>
            <MenuBtn
              data-trip-menu
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpenId(menuOpen ? null : trip.id);
              }}
              title="Trip actions"
              aria-label="Trip actions"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" />
              </svg>
            </MenuBtn>
            {menuOpen && (
              <Popover data-trip-menu onClick={(e) => e.stopPropagation()}>
                <PopoverItem
                  $danger
                  onClick={() => {
                    const ok =
                      typeof window === 'undefined'
                        ? true
                        : window.confirm(`Delete "${trip.title}"? This removes all its bookings.`);
                    if (!ok) return;
                    deleteTrip(trip.id);
                    setMenuOpenId(null);
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <path d="M19 6 18 20a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  </svg>
                  Delete trip
                </PopoverItem>
              </Popover>
            )}
          </CardWithMenu>
        );
      })}
    </Rail>
  );
};

export default TripList;
