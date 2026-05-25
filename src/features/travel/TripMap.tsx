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

const TYPE_COLOR: Record<BookingType, string> = {
  flight: '#38bdf8',     // sky blue
  hotel: '#feeb29',      // amber
  attraction: '#d97706', // burnt orange
  experience: '#14b8a6', // teal
  event: '#ec4899',      // pink
  activity: '#a855f7',   // purple
  restaurant: '#f87171', // red
  transport: '#22c55e',  // green
};

/* SVG bodies that mirror the itinerary's BookingCard / BookingDetailModal
   icons. Kept here as raw markup strings (rather than React components)
   because Leaflet's L.DivIcon takes an HTML string, not JSX. If a card
   icon changes, mirror the change here so the map stays in sync. */
const TYPE_ICON_SVG: Record<BookingType, string> = {
  flight: `<svg viewBox="0 0 24 24" fill="none" stroke="#1F2421" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>`,
  hotel: `<svg viewBox="0 0 24 24" fill="none" stroke="#1F2421" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  attraction: `<svg viewBox="0 0 24 24" fill="none" stroke="#1F2421" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
  experience: `<svg viewBox="0 0 24 24" fill="none" stroke="#1F2421" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%"><path d="M12 3v3"/><path d="M12 18v3"/><path d="M3 12h3"/><path d="M18 12h3"/><path d="m5.6 5.6 2.1 2.1"/><path d="m16.3 16.3 2.1 2.1"/><path d="m5.6 18.4 2.1-2.1"/><path d="m16.3 7.7 2.1-2.1"/></svg>`,
  event: `<svg viewBox="0 0 24 24" fill="none" stroke="#1F2421" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%"><path d="M3 7v3a2 2 0 0 0 0 4v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a2 2 0 0 0 0-4V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/></svg>`,
  activity: `<svg viewBox="0 0 24 24" fill="none" stroke="#1F2421" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%"><path d="M14 22V16L12 14M12 14L13 8M12 14H10M13 8C14 9.16667 15.6 11 18 11M13 8L12.8212 7.82124C12.2565 7.25648 11.2902 7.54905 11.1336 8.33223L10 14M10 14L8 22M18 9.5V22M8 7H7.72076C7.29033 7 6.90819 7.27543 6.77208 7.68377L5.5 11.5L7 12L8 7ZM14.5 3.5C14.5 4.05228 14.0523 4.5 13.5 4.5C12.9477 4.5 12.5 4.05228 12.5 3.5C12.5 2.94772 12.9477 2.5 13.5 2.5C14.0523 2.5 14.5 2.94772 14.5 3.5Z"/></svg>`,
  restaurant: `<svg viewBox="0 0 24 24" fill="none" stroke="#1F2421" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%"><path d="M3 2v7c0 1.7 1.3 3 3 3v10"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.7 1.3 3 3 3v6"/></svg>`,
  transport: `<svg viewBox="0 0 24 24" fill="none" stroke="#1F2421" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>`,
};

function buildIcon(type: BookingType, focused: boolean): L.DivIcon {
  const color = TYPE_COLOR[type];
  const size = focused ? 36 : 30;
  const iconBox = focused ? 20 : 17;
  return new L.DivIcon({
    html: `<div style="
      background:${color};
      border-radius:50%;
      width:${size}px;
      height:${size}px;
      display:flex;
      align-items:center;
      justify-content:center;
      border:2px solid ${focused ? '#242424' : 'white'};
      box-shadow:0 2px 8px rgba(36,36,36,${focused ? 0.45 : 0.25});
      transition:all 0.15s;
    "><div style="width:${iconBox}px;height:${iconBox}px;display:flex;">${TYPE_ICON_SVG[type]}</div></div>`,
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
      /* Defensive: drop rows missing the dayKey we need to bucket. */
      .filter((b) => typeof b.dayKey === 'string' && !!b.dayKey)
      /* Sort by (dayKey, position) so the map renders pins in the
         same order the itinerary does. Untimed items have no `start`
         so we can't compare timestamps directly. */
      .sort((a, b) => {
        const dk = a.dayKey.localeCompare(b.dayKey);
        return dk !== 0 ? dk : (a.position ?? 0) - (b.position ?? 0);
      })
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
                  {booking.start ? `${formatTimeOfDay(booking.start)} · ` : ''}
                  {label}
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
