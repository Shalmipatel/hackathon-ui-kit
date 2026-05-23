import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import styled from 'styled-components';
import { theme } from '@/components/theme';
import type { Hotel } from './vio-types';
import 'leaflet/dist/leaflet.css';

const hotelIcon = new L.DivIcon({
  html: `<div style="background:${theme.colors.primaryVivid};color:white;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);">H</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
  className: '',
});

function FitBounds({ hotels }: { hotels: Hotel[] }) {
  const map = useMap();
  useEffect(() => {
    const positions = hotels
      .filter((h) => h.location?.latitude != null && h.location?.longitude != null)
      .map((h) => [h.location!.latitude!, h.location!.longitude!] as [number, number]);
    if (positions.length > 0) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [hotels, map]);
  return null;
}

const EmptyState = styled.div`
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${theme.colors.textMuted};
  font-size: 13px;
`;

const PopupContent = styled.div`
  cursor: pointer;
  min-width: 180px;
`;

const PopupImage = styled.img`
  width: 100%;
  height: 96px;
  object-fit: cover;
  border-radius: 6px;
  margin-bottom: 8px;
`;

const PopupName = styled.div`
  font-weight: 600;
  font-size: 13px;
`;

const PopupRating = styled.div`
  font-size: 12px;
  color: ${theme.colors.textSecondary};
  margin-top: 2px;
`;

const PopupPrice = styled.div`
  font-weight: 700;
  color: ${theme.colors.primaryVivid};
  margin-top: 4px;
`;

const PopupHint = styled.div`
  font-size: 11px;
  color: ${theme.colors.primary};
  margin-top: 4px;
`;

interface Props {
  hotels: Hotel[];
  currency?: string;
  onSelectHotel: (hotel: Hotel) => void;
}

const VioMapView: React.FC<Props> = ({ hotels, currency = 'USD', onSelectHotel }) => {
  const mappable = hotels.filter(
    (h) => h.location?.latitude != null && h.location?.longitude != null,
  );
  const sym = currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';

  if (mappable.length === 0) {
    return <EmptyState>No location data available for map display</EmptyState>;
  }

  const center: [number, number] = [
    mappable[0].location!.latitude!,
    mappable[0].location!.longitude!,
  ];

  return (
    <MapContainer
      center={center}
      zoom={13}
      style={{ height: '100%', width: '100%', borderRadius: theme.borderRadius.md }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds hotels={mappable} />
      {mappable.map((hotel) => (
        <Marker
          key={hotel.id}
          position={[hotel.location!.latitude!, hotel.location!.longitude!]}
          icon={hotelIcon}
        >
          <Popup>
            <PopupContent onClick={() => onSelectHotel(hotel)}>
              {hotel.media?.images?.[0] && (
                <PopupImage src={hotel.media.images[0]} alt="" />
              )}
              <PopupName>{hotel.name}</PopupName>
              {hotel.rating && (
                <PopupRating>Rating: {hotel.rating.overall.toFixed(1)}/10</PopupRating>
              )}
              {hotel.offers?.cheapestRate && (
                <PopupPrice>
                  {sym}
                  {Math.round(hotel.offers.cheapestRate.displayPrice)}
                </PopupPrice>
              )}
              <PopupHint>Click for details</PopupHint>
            </PopupContent>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
};

export default VioMapView;
