import React, { useCallback, useState } from 'react';
import styled from 'styled-components';
import { useIsMobile } from '@/components/useIsMobile';
import { useSendMessage } from '@/features/chat/useSendMessage';
import TripList from './TripList';
import Itinerary from './Itinerary';
import TripMap from './TripMap';
import ConnectionsPanel from './ConnectionsPanel';
import TripChatButton from './TripChatButton';
import { useBookingIngestion } from './useBookingIngestion';
import { BOOKING_CONTRACT_PROMPT } from './parser';
import { selectActiveTrip, useTravelStore } from './travel-store';
import { formatTripRange } from './format';

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
  grid-template-columns: 240px minmax(0, 1fr) 360px;
  gap: 16px;
  flex: 1;
  min-height: 0;

  @media (max-width: 1280px) {
    grid-template-columns: 220px minmax(0, 1fr) 320px;
  }

  @media (max-width: 1100px) {
    grid-template-columns: 200px minmax(0, 1fr);
  }

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto 1fr;
  }
`;

const RailWrap = styled.div`
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;

  /* Hide scrollbar visually but keep functional */
  scrollbar-width: thin;
  scrollbar-color: rgba(36, 36, 36, 0.15) transparent;
  &::-webkit-scrollbar { width: 6px; }
  &::-webkit-scrollbar-thumb { background: rgba(36, 36, 36, 0.15); border-radius: 3px; }
`;

const Center = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid rgba(36, 36, 36, 0.06);
  border-radius: 18px;
  overflow: hidden;
`;

const CenterScroll = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 24px 28px 32px;

  scrollbar-width: thin;
  scrollbar-color: rgba(36, 36, 36, 0.15) transparent;
  &::-webkit-scrollbar { width: 8px; }
  &::-webkit-scrollbar-thumb { background: rgba(36, 36, 36, 0.18); border-radius: 4px; }

  @media (max-width: 768px) {
    padding: 16px 16px 24px;
  }
`;

const RightCol = styled.aside`
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;

  @media (max-width: 1100px) {
    display: none;
  }
`;

const MapBox = styled.div`
  height: 260px;
  flex-shrink: 0;
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid rgba(36, 36, 36, 0.06);
  background: #e6e7eb;
`;

const SideScroll = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-right: 4px;

  scrollbar-width: thin;
  scrollbar-color: rgba(36, 36, 36, 0.15) transparent;
  &::-webkit-scrollbar { width: 6px; }
  &::-webkit-scrollbar-thumb { background: rgba(36, 36, 36, 0.15); border-radius: 3px; }
`;

const MapCompact = styled.div`
  display: none;

  @media (max-width: 1100px) and (min-width: 769px) {
    display: block;
    height: 220px;
    border-radius: 16px;
    overflow: hidden;
    border: 1px solid rgba(36, 36, 36, 0.06);
    background: #e6e7eb;
    margin-bottom: 16px;
  }

  @media (max-width: 900px) {
    display: block;
    height: 200px;
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid rgba(36, 36, 36, 0.06);
    background: #e6e7eb;
  }
`;

const ConnectionsCompact = styled.div`
  display: none;

  @media (max-width: 1100px) {
    display: block;
    margin-top: 24px;
  }
`;

interface TripsViewProps {
  onNavigateToChat: () => void;
}

export const TripsView: React.FC<TripsViewProps> = ({ onNavigateToChat }) => {
  const [focusedBookingId, setFocusedBookingId] = useState<string | null>(null);
  const sendMessage = useSendMessage();
  /* Listen for agent-emitted booking blocks in the chat and merge them
     into the travel store. Mounting here is fine: trips is the default
     landing view, so by the time the agent might reply this hook is
     already armed. */
  useBookingIngestion();
  /* Threshold matches the @media break for RightCol so we only mount one
     leaflet map at a time. Two maps + a 0×0 container causes wasted work
     and a stale fitBounds against an undersized container. */
  const showRightRail = !useIsMobile(1100);
  const showCompactMap = !showRightRail;

  const handleScanInbox = useCallback(() => {
    const trip = selectActiveTrip(useTravelStore.getState());
    const tripCtx = trip
      ? `Active trip: ${trip.title} (${trip.destination}) — ${formatTripRange(trip)}. Trip id: ${trip.id}.`
      : 'No specific trip selected; group by destination if you find multiple.';
    sendMessage(
      `Please scan my Gmail for travel confirmations (flights, hotels, activities, restaurants, ground transport). ${tripCtx}\n\n${BOOKING_CONTRACT_PROMPT}`,
    );
    onNavigateToChat();
  }, [onNavigateToChat, sendMessage]);

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
        <RailWrap>
          <TripList />
        </RailWrap>

        <Center>
          <CenterScroll>
            {showCompactMap && (
              <MapCompact>
                <TripMap
                  focusedBookingId={focusedBookingId}
                  onBookingClick={(id) => setFocusedBookingId(id)}
                />
              </MapCompact>
            )}
            <Itinerary
              focusedBookingId={focusedBookingId}
              onBookingClick={(id) =>
                setFocusedBookingId((prev) => (prev === id ? null : id))
              }
            />
            {showCompactMap && (
              <ConnectionsCompact>
                <ConnectionsPanel onScanInbox={handleScanInbox} />
              </ConnectionsCompact>
            )}
          </CenterScroll>
        </Center>

        {showRightRail && (
          <RightCol>
            <MapBox>
              <TripMap
                focusedBookingId={focusedBookingId}
                onBookingClick={(id) => setFocusedBookingId(id)}
              />
            </MapBox>
            <SideScroll>
              <TripChatButton onNavigateToChat={onNavigateToChat} />
              <ConnectionsPanel onScanInbox={handleScanInbox} />
            </SideScroll>
          </RightCol>
        )}
      </Body>
    </Page>
  );
};

export default TripsView;
