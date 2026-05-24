import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { getChatStore } from '@/features/app/bootstrap';
import { useTravelStore } from './travel-store';
import { useScanForTrips } from './useScanForTrips';
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
  background: #216869;
  color: #242424;
  border: none;
  padding: 6px 10px;
  border-radius: 8px;
  font-family: 'Inter', sans-serif;
  font-weight: 600;
  font-size: 11.5px;
  cursor: pointer;
  transition: transform 0.12s;

  &:hover:not(:disabled) { transform: translateY(-1px); }
  &:disabled { opacity: 0.6; cursor: progress; }
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
  padding: 4px 8px;
  border-radius: 6px;

  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
  }

  &:disabled {
    opacity: 0.55;
    cursor: progress;
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

const CardWithMenu = styled.div<{ $dim?: boolean }>`
  position: relative;
  opacity: ${(p) => (p.$dim ? 0.55 : 1)};
  transition: opacity 0.15s;
  &:hover {
    opacity: 1;
  }
`;

/* Past / archived trips fold into this section. Header is the
   click target so the whole thing collapses with one tap. */
const SectionToggle = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 10px 8px 14px;
  margin-top: 14px;
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: 'Inter', sans-serif;
  font-weight: 700;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.4);
  border-radius: 6px;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.7);
  }

  svg {
    transition: transform 0.15s;
  }
`;

const Chev = styled.svg<{ $open: boolean }>`
  transform: ${(p) => (p.$open ? 'rotate(90deg)' : 'rotate(0deg)')};
`;

const PastBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.55);
  margin-left: 6px;
`;

/* Popover is portal'd to document.body and positioned with fixed
   coords so the rail's overflow-y: auto can't clip it. */
const Popover = styled.div`
  position: fixed;
  z-index: 9999;
  min-width: 168px;
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 6px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.45);
`;

/* Invisible click-shield to close the popover on outside click — using
   a portal'd overlay means a click anywhere (including on the page
   chrome) closes it cleanly. */
const PopoverScrim = styled.div`
  position: fixed;
  inset: 0;
  z-index: 9998;
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
  /** Optional override — falls back to triggering a trip-discovery
   *  scan via the agent (the canonical "+ New" behaviour). */
  onCreateTrip?: () => void;
}

/** YYYY-MM-DD for "today" using local-time calendar so a trip ending
 *  today is still considered current. */
function todayIsoDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const TripList: React.FC<TripListProps> = ({ onCreateTrip }) => {
  const allTrips = useTravelStore((s) => s.trips);
  /* Partition into active (upcoming / in-progress, not archived) and
     past/archived. Sort active ascending so the soonest is on top;
     sort past descending so the most recent is at the top of the
     folded section. */
  const { activeTrips, pastTrips } = useMemo(() => {
    const today = todayIsoDate();
    const cmpAsc = (a: typeof allTrips[number], b: typeof allTrips[number]) =>
      a.startDate !== b.startDate
        ? a.startDate < b.startDate ? -1 : 1
        : a.title.localeCompare(b.title);
    const cmpDesc = (a: typeof allTrips[number], b: typeof allTrips[number]) =>
      a.startDate !== b.startDate
        ? a.startDate > b.startDate ? -1 : 1
        : a.title.localeCompare(b.title);
    const active: typeof allTrips = [];
    const past: typeof allTrips = [];
    for (const t of allTrips) {
      const isPastDate = t.endDate < today;
      if (t.archived || isPastDate) past.push(t);
      else active.push(t);
    }
    return { activeTrips: active.sort(cmpAsc), pastTrips: past.sort(cmpDesc) };
  }, [allTrips]);
  const activeTripId = useTravelStore((s) => s.activeTripId);
  const setActiveTrip = useTravelStore((s) => s.setActiveTrip);
  const bookings = useTravelStore((s) => s.bookings);
  const deleteTrip = useTravelStore((s) => s.deleteTrip);
  const archiveTrip = useTravelStore((s) => s.archiveTrip);
  const unarchiveTrip = useTravelStore((s) => s.unarchiveTrip);
  const { scan, scanInFlight } = useScanForTrips();
  const triggerCreate = onCreateTrip ?? scan;
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number } | null>(null);
  const [pastOpen, setPastOpen] = useState(false);

  /* Close the portal'd popover if the rail scrolls — the anchor is
     captured against viewport coords and would drift otherwise. */
  useEffect(() => {
    if (!menuOpenId) return;
    const onScroll = () => {
      setMenuOpenId(null);
      setMenuAnchor(null);
    };
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', onScroll, { capture: true });
  }, [menuOpenId]);

  return (
    <Rail>
      <RailHeader>
        Trips
        <NewBtn onClick={triggerCreate} disabled={scanInFlight} title="Scan connections for new trips">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          {scanInFlight ? 'Scanning…' : 'Scan'}
        </NewBtn>
      </RailHeader>
      {allTrips.length === 0 && (
        <SidebarEmpty>
          <strong>No trips yet</strong>
          <span>Connect Gmail or calendar — the assistant will find your trips.</span>
          <SidebarEmptyBtn onClick={triggerCreate} disabled={scanInFlight}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            {scanInFlight ? 'Scanning…' : 'Scan for trips'}
          </SidebarEmptyBtn>
        </SidebarEmpty>
      )}
      {activeTrips.map((trip) =>
        renderTripCard(trip, false),
      )}

      {pastTrips.length > 0 && (
        <>
          <SectionToggle
            onClick={() => setPastOpen((v) => !v)}
            aria-expanded={pastOpen}
          >
            <span>
              Past · {pastTrips.length}
            </span>
            <Chev $open={pastOpen} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </Chev>
          </SectionToggle>
          {pastOpen && pastTrips.map((trip) => renderTripCard(trip, true))}
        </>
      )}
    </Rail>
  );

  /* Card renderer extracted so active + past trips share the same
     markup. `inPastSection` dims the card + flips the menu item from
     Archive to Unarchive based on the trip's archived state. */
  function renderTripCard(trip: typeof allTrips[number], inPastSection: boolean) {
    const count = bookings.filter((b) => b.tripId === trip.id).length;
    const menuOpen = menuOpenId === trip.id;
    const today = todayIsoDate();
    const isPastDate = trip.endDate < today;
    return (
      <CardWithMenu
        key={trip.id}
        data-menu-open={menuOpen}
        $dim={inPastSection}
      >
        <Card
          $active={trip.id === activeTripId}
          $accent={trip.color}
          onClick={() => setActiveTrip(trip.id)}
        >
          <Title>
            {trip.title}
            {isPastDate && inPastSection && <PastBadge>Past</PastBadge>}
            {trip.archived && <PastBadge>Archived</PastBadge>}
          </Title>
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
            if (menuOpen) {
              setMenuOpenId(null);
              setMenuAnchor(null);
              return;
            }
            /* Anchor the portal'd popover off the button so it lines
               up with the trip card no matter where on the page it
               sits. position: fixed needs viewport coords. */
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setMenuAnchor({ top: rect.bottom + 6, left: Math.max(8, rect.right - 168) });
            setMenuOpenId(trip.id);
          }}
          title="Trip actions"
          aria-label="Trip actions"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" />
          </svg>
        </MenuBtn>
        {menuOpen && menuAnchor && createPortal(
          <>
            <PopoverScrim onClick={() => { setMenuOpenId(null); setMenuAnchor(null); }} />
            <Popover
              data-trip-menu
              style={{ top: menuAnchor.top, left: menuAnchor.left }}
              onClick={(e) => e.stopPropagation()}
            >
            {trip.archived ? (
              <PopoverItem
                onClick={() => {
                  unarchiveTrip(trip.id);
                  setMenuOpenId(null);
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="5" rx="1" />
                  <path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
                  <path d="M10 12h4" />
                </svg>
                Unarchive trip
              </PopoverItem>
            ) : (
              <PopoverItem
                onClick={() => {
                  archiveTrip(trip.id);
                  setMenuOpenId(null);
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="5" rx="1" />
                  <path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
                  <path d="M10 12h4" />
                </svg>
                Archive trip
              </PopoverItem>
            )}
            <PopoverItem
              $danger
              onClick={() => {
                const ok =
                  typeof window === 'undefined'
                    ? true
                    : window.confirm(`Delete "${trip.title}"? This removes its bookings and chat history, and prevents future scans from re-adding it.`);
                if (!ok) return;
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
          </>,
          document.body,
        )}
      </CardWithMenu>
    );
  }
};

export default TripList;
