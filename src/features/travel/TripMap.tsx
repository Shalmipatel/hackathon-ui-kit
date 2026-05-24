import React, { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import styled from 'styled-components';
import 'leaflet/dist/leaflet.css';
import { useTravelStore } from './travel-store';
import { bookingLocation, formatTimeOfDay } from './format';
import type { Booking, BookingType } from './types';

const Wrap = styled.div`
  height: 100%;
  width: 100%;
  border-radius: 16px;
  overflow: hidden;
  background: #e6e7eb;
  position: relative;

  .leaflet-container {
    height: 100%;
    width: 100%;
    background: #e6e7eb;
    font-family: 'Inter', sans-serif;
  }
`;

const Empty = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(36, 36, 36, 0.5);
  font-family: 'Inter', sans-serif;
  font-size: 13px;
`;

const PopupBody = styled.div`
  min-width: 160px;
  font-family: 'Inter', sans-serif;
`;

const PopupTitle = styled.div`
  font-weight: 600;
  font-size: 13px;
  color: #242424;
`;

const PopupMeta = styled.div`
  margin-top: 2px;
  font-size: 11.5px;
  color: rgba(36, 36, 36, 0.6);
`;

const TYPE_GLYPH: Record<BookingType, string> = {
  flight: '✈',
  hotel: 'H',
  activity: '◉',
  restaurant: '🍴',
  transport: 'T',
};

const TYPE_COLOR: Record<BookingType, string> = {
  flight: '#38bdf8',
  hotel: '#feeb29',
  activity: '#a855f7',
  restaurant: '#f87171',
  transport: '#22c55e',
};

function buildIcon(type: BookingType, focused: boolean): L.DivIcon {
  const color = TYPE_COLOR[type];
  const size = focused ? 36 : 30;
  return new L.DivIcon({
    html: `<div style="
      background:${color};
      color:#242424;
      border-radius:50%;
      width:${size}px;
      height:${size}px;
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:${focused ? 15 : 13}px;
      font-weight:700;
      border:2px solid ${focused ? '#242424' : 'white'};
      box-shadow:0 2px 8px rgba(36,36,36,${focused ? 0.45 : 0.25});
      transition:all 0.15s;
    ">${TYPE_GLYPH[type]}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
    className: '',
  });
}

function FitBounds({ points, focusedPoint }: { points: L.LatLngTuple[]; focusedPoint?: L.LatLngTuple }) {
  const map = useMap();
  useEffect(() => {
    const apply = () => {
      map.invalidateSize();
      if (focusedPoint) {
        map.setView(focusedPoint, Math.max(map.getZoom(), 12), { animate: true });
        return;
      }
      if (points.length === 0) return;
      if (points.length === 1) {
        map.setView(points[0], 11, { animate: false });
        return;
      }
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 11 });
    };
    apply();
    /* Re-fit when the container is resized — important because leaflet
       computes bounds against the current container size, and on first
       mount that's often 0×0 (still in layout). */
    const container = map.getContainer();
    const ro = new ResizeObserver(() => apply());
    ro.observe(container);
    return () => ro.disconnect();
  }, [points, focusedPoint, map]);
  return null;
}

interface TripMapProps {
  focusedBookingId?: string | null;
  onBookingClick?: (bookingId: string) => void;
  /** Override the trip this map renders. Defaults to the travel-store's
   *  activeTripId — same escape-hatch story as Itinerary's `tripId`
   *  prop so a list of trips (mobile carousel) can render each map
   *  independently. */
  tripId?: string;
}

export const TripMap: React.FC<TripMapProps> = ({ focusedBookingId, onBookingClick, tripId }) => {
  const storeActiveTripId = useTravelStore((s) => s.activeTripId);
  const activeTripId = tripId ?? storeActiveTripId;
  const allBookings = useTravelStore((s) => s.bookings);

  const items = useMemo(() => {
    return allBookings
      .filter((b) => b.tripId === activeTripId)
      /* Defensive: agent-written RTDB rows sometimes lack `start`
         (and would NaN out the sort + downstream renderers). Drop
         them here so the map stays alive. */
      .filter((b) => typeof b.start === 'string' && !!b.start)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      .map((b) => {
        const loc = bookingLocation(b);
        return loc ? { booking: b, ...loc } : null;
      })
      .filter(
        (x): x is { booking: Booking; lat: number; lng: number; label: string } =>
          x !== null,
      );
  }, [allBookings, activeTripId]);

  const points = useMemo<L.LatLngTuple[]>(
    () => items.map((i) => [i.lat, i.lng]),
    [items],
  );

  const focusedPoint = useMemo<L.LatLngTuple | undefined>(() => {
    const f = items.find((i) => i.booking.id === focusedBookingId);
    return f ? [f.lat, f.lng] : undefined;
  }, [items, focusedBookingId]);

  if (!activeTripId) {
    return (
      <Wrap>
        <Empty>Select a trip to see it on the map.</Empty>
      </Wrap>
    );
  }

  const center: L.LatLngTuple = points[0] ?? [20, 0];
  return (
    <Wrap>
      <MapContainer
        center={center}
        zoom={points.length > 0 ? 4 : 2}
        scrollWheelZoom
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          /* CartoDB Voyager — colored basemap (green parks, blue water,
             beige labels) that reads closer to Google Maps than the
             muted "light_all" style. Still free, no API key. */
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />
        <FitBounds points={points} focusedPoint={focusedPoint} />
        {items.map(({ booking, lat, lng, label }) => (
          <Marker
            key={booking.id}
            position={[lat, lng]}
            icon={buildIcon(booking.type, booking.id === focusedBookingId)}
            eventHandlers={{
              click: () => onBookingClick?.(booking.id),
            }}
          >
            <Popup>
              <PopupBody>
                <PopupTitle>{booking.title}</PopupTitle>
                <PopupMeta>
                  {formatTimeOfDay(booking.start)} · {label}
                </PopupMeta>
              </PopupBody>
            </Popup>
          </Marker>
        ))}
        {items.length === 0 && <Empty>No mapped bookings yet.</Empty>}
      </MapContainer>
    </Wrap>
  );
};

export default TripMap;
