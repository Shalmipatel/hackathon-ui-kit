import React from 'react';
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

interface TripListProps {
  onCreateTrip?: () => void;
}

export const TripList: React.FC<TripListProps> = ({ onCreateTrip }) => {
  const trips = useTravelStore((s) => s.trips);
  const activeTripId = useTravelStore((s) => s.activeTripId);
  const setActiveTrip = useTravelStore((s) => s.setActiveTrip);
  const bookings = useTravelStore((s) => s.bookings);

  return (
    <Rail>
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
        return (
          <Card
            key={trip.id}
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
        );
      })}
    </Rail>
  );
};

export default TripList;
