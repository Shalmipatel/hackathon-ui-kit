import React, { useState, useCallback } from 'react';
import { LayoutGrid, List, Map } from 'lucide-react';
import styled from 'styled-components';
import { theme } from '@/components/theme';
import type { VioSearchResponse, Hotel } from './vio-types';
import VioHotelCard from './VioHotelCard';
import VioHotelDetail from './VioHotelDetail';
import VioMapView from './VioMapView';

type ViewMode = 'grid' | 'list' | 'map';

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 8px 0;
`;

const TopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

const Meta = styled.div`
  font-size: 13px;
  color: ${theme.colors.textSecondary};
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
`;

const MetaBold = styled.span`
  font-weight: 500;
  color: ${theme.colors.textPrimary};
`;

const ViewToggle = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  background: ${theme.colors.background};
  border-radius: ${theme.borderRadius.sm};
  padding: 2px;
`;

const ToggleBtn = styled.button<{ $active: boolean }>`
  padding: 6px 8px;
  border-radius: 6px;
  border: none;
  background: ${(p) => (p.$active ? theme.colors.surface : 'transparent')};
  box-shadow: ${(p) => (p.$active ? theme.shadows.sm : 'none')};
  color: ${(p) => (p.$active ? theme.colors.primaryVivid : theme.colors.textSecondary)};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  &:hover {
    color: ${theme.colors.textPrimary};
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
`;

const ListLayout = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const MapContainer = styled.div`
  height: 400px;
  border-radius: ${theme.borderRadius.md};
  overflow: hidden;
  box-shadow: ${theme.shadows.sm};
`;

const NoResults = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  gap: 8px;
  text-align: center;
`;

const StreamingFooter = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-radius: ${theme.borderRadius.sm};
  background: ${theme.colors.background};
  font-size: 13px;
  color: ${theme.colors.textSecondary};
`;

const SmallSpinner = styled.div`
  width: 16px;
  height: 16px;
  border: 2px solid ${theme.colors.border};
  border-top-color: ${theme.colors.primary};
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

interface Props {
  data: VioSearchResponse;
  isStreaming?: boolean;
}

const VioHotelSearchResults: React.FC<Props> = ({ data, isStreaming }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectedHotel, setSelectedHotel] = useState<Hotel | null>(null);

  const hotels = data.hotels || [];

  const handleSelect = useCallback((hotel: Hotel) => {
    setSelectedHotel(hotel);
  }, []);

  if (!isStreaming && hotels.length === 0) {
    return (
      <NoResults>
        <div style={{ fontSize: 32 }}>🏨</div>
        <div style={{ fontSize: 15, fontWeight: 500, color: theme.colors.textPrimary }}>
          No hotels found
        </div>
        <div style={{ fontSize: 13, color: theme.colors.textSecondary }}>
          Try adjusting your search criteria or filters
        </div>
      </NoResults>
    );
  }

  if (isStreaming && hotels.length === 0) {
    return (
      <Wrapper>
        <StreamingFooter>
          <SmallSpinner />
          Loading hotel results...
        </StreamingFooter>
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <TopBar>
        <Meta>
          {data.placeDisplayName && <MetaBold>{data.placeDisplayName}</MetaBold>}
          {data.checkIn && data.checkOut && (
            <span>
              · {data.checkIn} to {data.checkOut}
            </span>
          )}
          {data.nights && (
            <span>
              · {data.nights} night{data.nights !== 1 ? 's' : ''}
            </span>
          )}
          {data.currency && <span>· {data.currency}</span>}
          <span>
            · {hotels.length} hotel{hotels.length !== 1 ? 's' : ''}
            {data.totalResults && data.totalResults > hotels.length && (
              <span style={{ color: theme.colors.textMuted }}> of {data.totalResults}</span>
            )}
          </span>
        </Meta>
        <ViewToggle>
          <ToggleBtn
            $active={viewMode === 'grid'}
            onClick={() => setViewMode('grid')}
            title="Grid view"
          >
            <LayoutGrid size={16} />
          </ToggleBtn>
          <ToggleBtn
            $active={viewMode === 'list'}
            onClick={() => setViewMode('list')}
            title="List view"
          >
            <List size={16} />
          </ToggleBtn>
          <ToggleBtn
            $active={viewMode === 'map'}
            onClick={() => setViewMode('map')}
            title="Map view"
          >
            <Map size={16} />
          </ToggleBtn>
        </ViewToggle>
      </TopBar>

      {viewMode === 'map' ? (
        <MapContainer>
          <VioMapView hotels={hotels} currency={data.currency} onSelectHotel={handleSelect} />
        </MapContainer>
      ) : viewMode === 'list' ? (
        <ListLayout>
          {hotels.map((hotel) => (
            <VioHotelCard
              key={hotel.id}
              hotel={hotel}
              currency={data.currency}
              onSelect={handleSelect}
            />
          ))}
        </ListLayout>
      ) : (
        <Grid>
          {hotels.map((hotel) => (
            <VioHotelCard
              key={hotel.id}
              hotel={hotel}
              currency={data.currency}
              onSelect={handleSelect}
            />
          ))}
        </Grid>
      )}

      {isStreaming && (
        <StreamingFooter>
          <SmallSpinner />
          Loading more hotels{hotels.length > 0 ? ` (${hotels.length} so far)` : ''}...
        </StreamingFooter>
      )}

      {selectedHotel && (
        <VioHotelDetail
          hotel={selectedHotel}
          currency={data.currency}
          checkIn={data.checkIn}
          checkOut={data.checkOut}
          onClose={() => setSelectedHotel(null)}
        />
      )}
    </Wrapper>
  );
};

export default VioHotelSearchResults;
