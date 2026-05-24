import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import { useIsMobile } from '@/components/useIsMobile';
import Itinerary from './Itinerary';
import TripMap from './TripMap';
import TripChatPanel from './TripChatPanel';
import BookingDetailModal from './BookingDetailModal';
import { useBookingIngestion } from './useBookingIngestion';
import { useScanForTrips } from './useScanForTrips';
import { useFirebaseSync } from './useFirebaseSync';
import { useTravelStore } from './travel-store';

const Page = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: #fbfaf9;
  padding: 16px;
  gap: 16px;
  overflow: hidden;

  @media (max-width: 768px) {
    padding: 12px;
    gap: 12px;
  }
`;

const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 4px;
  flex-shrink: 0;
  font-family: 'Inter', sans-serif;
`;

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const BrandMark = styled.div`
  width: 36px;
  height: 36px;
  border-radius: 11px;
  background: linear-gradient(135deg, #feeb29 0%, #f5b400 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #242424;
`;

const BrandText = styled.div`
  display: flex;
  flex-direction: column;
  line-height: 1.1;
`;

const BrandTitle = styled.div`
  font-weight: 700;
  font-size: 16px;
  color: #242424;
  letter-spacing: -0.3px;
`;

const BrandSub = styled.div`
  font-size: 11.5px;
  color: rgba(36, 36, 36, 0.55);
  margin-top: 2px;
`;

const Body = styled.div`
  display: grid;
  /* Trip list moved into the main sidebar — body is now itinerary
     + chat. One left nav for the whole app. */
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: 16px;
  flex: 1;
  min-height: 0;

  @media (max-width: 1280px) {
    grid-template-columns: minmax(0, 1fr) 340px;
  }

  @media (max-width: 1100px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

/* Center is a vertical stack: map on top, itinerary scroll below.
   They're SIBLINGS, not overlapping — the map isn't sticky, it just
   sits as the upper section of the pane and stays put because nothing
   moves it. The itinerary scrolls independently below it. */
const Center = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #fff;
  border: 1px solid rgba(36, 36, 36, 0.06);
  border-radius: 18px;
  overflow: hidden;
`;

const MapStrip = styled.div`
  height: 220px;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(36, 36, 36, 0.06);
  background: #e6e7eb;
  /* Squash TripMap's own 16px radius — the strip sits flush against
     the page card's top corners (handled by Center's overflow:hidden)
     and butts up against the itinerary below. Internal rounding here
     leaves the visible "floating pill" curves the user flagged. */
  & > div { border-radius: 0; }

  @media (max-width: 768px) {
    height: 180px;
  }
`;

const ItineraryScroll = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 24px 28px 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;

  scrollbar-width: thin;
  scrollbar-color: rgba(36, 36, 36, 0.15) transparent;
  &::-webkit-scrollbar { width: 8px; }
  &::-webkit-scrollbar-thumb { background: rgba(36, 36, 36, 0.18); border-radius: 4px; }

  @media (max-width: 768px) {
    padding: 16px 16px 24px;
  }
`;

const ChatCol = styled.aside`
  min-height: 0;

  @media (max-width: 1100px) {
    display: none;
  }
`;

const EmptyCenter = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  font-family: 'Inter', sans-serif;
  gap: 16px;
`;

const EmptyIllustration = styled.div`
  width: 72px;
  height: 72px;
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #feeb29 0%, #f5b400 100%);
  color: #242424;
`;

const EmptyTitle = styled.h2`
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  color: #242424;
  letter-spacing: -0.4px;
`;

const EmptyBody = styled.p`
  margin: 0;
  max-width: 380px;
  font-size: 14px;
  line-height: 21px;
  color: rgba(36, 36, 36, 0.6);
`;

const EmptyCta = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  border: none;
  background: #242424;
  color: #fff;
  font-family: 'Inter', sans-serif;
  font-weight: 600;
  font-size: 13.5px;
  padding: 11px 18px;
  border-radius: 12px;
  cursor: pointer;
  transition: transform 0.12s;
  box-shadow: 0 6px 16px -10px rgba(36, 36, 36, 0.45);

  &:hover:not(:disabled) { transform: translateY(-1px); }
  &:disabled { opacity: 0.65; cursor: progress; }
`;

interface TripsViewProps {
  /** Kept for prop-compat with TabPage; unused now that chat is inline. */
  onNavigateToChat?: () => void;
}

export const TripsView: React.FC<TripsViewProps> = () => {
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  /* The booking the map is currently panned to, driven by scroll
     position rather than clicks. Click selection (which opens the
     modal) overrides this when active. */
  const [scrollFocusedBookingId, setScrollFocusedBookingId] = useState<string | null>(null);
  /* Listen for agent-emitted booking blocks in the chat and merge them
     into the travel store. Mounting here is fine: trips is the default
     landing view, so by the time the agent might reply this hook is
     already armed. */
  useBookingIngestion();
  /* Mirror local trip / booking state to Firebase RTDB if configured.
     No-op when Firebase env vars aren't set. */
  useFirebaseSync();
  const showChatCol = !useIsMobile(1100);

  const trips = useTravelStore((s) => s.trips);
  const bookings = useTravelStore((s) => s.bookings);
  const { scan: scanForTrips, scanInFlight } = useScanForTrips();
  const hasTrips = trips.length > 0;

  const selectedBooking = useMemo(
    () => bookings.find((b) => b.id === selectedBookingId) ?? null,
    [bookings, selectedBookingId],
  );

  /* Map focuses on the clicked booking if there is one; otherwise on
     whatever the scroll-spy is currently surfacing. */
  const mapFocusId = selectedBookingId ?? scrollFocusedBookingId;

  return (
    <Page>
      <HeaderRow>
        <Brand>
          <BrandMark>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
            </svg>
          </BrandMark>
          <BrandText>
            <BrandTitle>Wanderbot</BrandTitle>
            <BrandSub>Your agentic travel planner</BrandSub>
          </BrandText>
        </Brand>
      </HeaderRow>

      <Body>
        <Center>
          {hasTrips ? (
            <>
              <MapStrip>
                <TripMap
                  focusedBookingId={mapFocusId}
                  onBookingClick={setSelectedBookingId}
                />
              </MapStrip>
              <ItineraryScroll>
                <Itinerary
                  focusedBookingId={selectedBookingId}
                  onBookingClick={setSelectedBookingId}
                  onScrollFocus={setScrollFocusedBookingId}
                />
              </ItineraryScroll>
            </>
          ) : (
            <EmptyCenter>
              <EmptyIllustration>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
                </svg>
              </EmptyIllustration>
              <EmptyTitle>No trips yet</EmptyTitle>
              <EmptyBody>
                Connect Gmail or your calendar — the assistant will scan
                your inbox for confirmations and surface trips here
                automatically.
              </EmptyBody>
              <EmptyCta onClick={scanForTrips} disabled={scanInFlight}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                {scanInFlight ? 'Scanning…' : 'Scan for trips'}
              </EmptyCta>
            </EmptyCenter>
          )}
        </Center>

        {showChatCol && hasTrips && (
          <ChatCol>
            <TripChatPanel />
          </ChatCol>
        )}
      </Body>

      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          onClose={() => setSelectedBookingId(null)}
        />
      )}
    </Page>
  );
};

export default TripsView;
