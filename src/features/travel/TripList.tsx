import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { getChatStore } from '@/features/app/bootstrap';
import { useTravelStore } from './travel-store';
import { formatTripRange } from './format';

const Rail = styled.aside`
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0;
  overflow-y: auto;
`;

const RailHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 10px 4px 14px;
  font-family: 'Inter', sans-serif;
  font-weight: 700;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.4);
`;

const SidebarEmpty = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 14px 14px 16px;
  margin: 4px 4px 0;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px dashed rgba(255, 255, 255, 0.12);
  font-family: 'Inter', sans-serif;
  color: rgba(255, 255, 255, 0.55);

  strong {
    color: rgba(255, 255, 255, 0.92);
    font-size: 13.5px;
    font-weight: 600;
    letter-spacing: -0.2px;
  }
  span {
    font-size: 11.5px;
    line-height: 16px;
  }
`;

const SidebarEmptyBtn = styled.button`
  margin-top: 6px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: #feeb29;
  color: #242424;
  border: none;
  padding: 6px 10px;
  border-radius: 8px;
  font-family: 'Inter', sans-serif;
  font-weight: 600;
  font-size: 11.5px;
  cursor: pointer;
  transition: transform 0.12s;

  &:hover { transform: translateY(-1px); }
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
  color: rgba(255, 255, 255, 0.8);
  padding: 4px 6px;
  border-radius: 6px;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
  }
`;

const Card = styled.button<{ $active: boolean; $accent: string }>`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  text-align: left;
  padding: 10px 36px 10px 18px;
  background: ${(p) => (p.$active ? 'rgba(255, 255, 255, 0.08)' : 'transparent')};
  border: 1px solid
    ${(p) => (p.$active ? 'rgba(255, 255, 255, 0.12)' : 'transparent')};
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s;
  overflow: hidden;
  font-family: 'Inter', sans-serif;

  &::before {
    content: '';
    position: absolute;
    left: 6px;
    top: 12px;
    bottom: 12px;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: ${(p) => p.$accent};
    opacity: ${(p) => (p.$active ? 1 : 0.65)};
  }

  &:hover {
    background: rgba(255, 255, 255, 0.06);
  }
`;

const Title = styled.div`
  font-weight: 500;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.95);
  letter-spacing: -0.2px;
  line-height: 20px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Dest = styled.div`
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.5);
  line-height: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Meta = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.4);
`;

const Dates = styled.span`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
`;

const CountChip = styled.span`
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.4);
  font-variant-numeric: tabular-nums;
`;

/* Quiet ... icon — always present so the affordance is discoverable,
   but visually subdued so it doesn't fight the trip title. */
const MenuBtn = styled.button`
  position: absolute;
  top: 6px;
  right: 4px;
  background: transparent;
  border: none;
  cursor: pointer;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.35);
  transition: all 0.12s;
  z-index: 2;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }
`;

const CardWithMenu = styled.div`
  position: relative;
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
  /** Optional override — falls back to the travel store's
   *  openNewTripModal action when omitted. */
  onCreateTrip?: () => void;
}

export const TripList: React.FC<TripListProps> = ({ onCreateTrip }) => {
  const trips = useTravelStore((s) => s.trips);
  const activeTripId = useTravelStore((s) => s.activeTripId);
  const setActiveTrip = useTravelStore((s) => s.setActiveTrip);
  const bookings = useTravelStore((s) => s.bookings);
  const deleteTrip = useTravelStore((s) => s.deleteTrip);
  const openNewTripModal = useTravelStore((s) => s.openNewTripModal);
  const triggerCreate = onCreateTrip ?? openNewTripModal;
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
        <NewBtn onClick={triggerCreate} title="New trip">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New
        </NewBtn>
      </RailHeader>
      {trips.length === 0 && (
        <SidebarEmpty>
          <strong>No trips yet</strong>
          <span>Create your first trip to get started.</span>
          <SidebarEmptyBtn onClick={triggerCreate}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New trip
          </SidebarEmptyBtn>
        </SidebarEmpty>
      )}
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
                <Dates>{formatTripRange(trip)}</Dates>
                <CountChip>{count}</CountChip>
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
                        : window.confirm(`Delete "${trip.title}"? This removes its bookings and chat history.`);
                    if (!ok) return;
                    /* Tear down the chat-store session first so we
                       don't leave an orphan session behind. */
                    if (trip.chatSessionId) {
                      try {
                        getChatStore()
                          .getState()
                          .deleteSession(trip.chatSessionId)
                          .catch((err) => console.warn('[trip-list] session delete failed', err));
                      } catch (err) {
                        console.warn('[trip-list] chat store unavailable', err);
                      }
                    }
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
