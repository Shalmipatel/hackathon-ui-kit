import React, { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import styled from 'styled-components';
import 'leaflet/dist/leaflet.css';
import { useTravelStore } from './travel-store';
import {
  bookingDayKey,
  bookingLocation,
  formatTimeOfDay,
  tripDayKeys,
} from './format';
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

const PopupDayChip = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 6px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #fff;
  background: ${(p) => p.$color};
`;

/* Optional human-readable type prefix used inside the popup body — the
   pin itself now shows the day number instead of a type glyph. */
const TYPE_LABEL: Record<BookingType, string> = {
  flight: 'Flight',
  hotel: 'Hotel',
  activity: 'Activity',
  restaurant: 'Restaurant',
  transport: 'Transport',
};

/* Pin colors are now keyed by trip-day index, not booking type. The
   palette stays inside the wanderbot/charcoal-teal-sage family at the
   front, then fans out into complementary hues. After 12 days it just
   cycles — beyond that the day number on the pin is enough to
   distinguish them. */
const DAY_PALETTE = [
  '#216869', // teal       (brand primary)
  '#49A078', // sage       (brand accent)
  '#d97757', // terracotta
  '#4B8BEA', // sky blue
  '#9F65D0', // violet
  '#E0A030', // amber
  '#c44569', // rose
  '#5B4FCF', // indigo
  '#20B2AA', // light sea green
  '#ea4335', // red
  '#8B5A2B', // saddle brown
  '#0F766E', // deep teal
];

function colorForDayIndex(index: number): string {
  if (index < 0) return DAY_PALETTE[0];
  return DAY_PALETTE[index % DAY_PALETTE.length];
}

/** Pin: filled circle, day number centered, white border. Focus state
 *  bumps size + swaps the border to charcoal so it pops above the
 *  unfocused pins of the same day. */
function buildIcon(color: string, dayNumber: number, focused: boolean): L.DivIcon {
  const size = focused ? 36 : 30;
  return new L.DivIcon({
    html: `<div style="
      background:${color};
      color:#ffffff;
      border-radius:50%;
      width:${size}px;
      height:${size}px;
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:${focused ? 14 : 12.5}px;
      font-weight:700;
      letter-spacing:-0.3px;
      border:2px solid ${focused ? '#1F2421' : 'white'};
      box-shadow:0 2px 8px rgba(31,36,33,${focused ? 0.45 : 0.25});
      transition:all 0.15s;
      font-family:'Inter', sans-serif;
    ">${dayNumber}</div>`,
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
}

export const TripMap: React.FC<TripMapProps> = ({ focusedBookingId, onBookingClick }) => {
  const activeTripId = useTravelStore((s) => s.activeTripId);
  const trips = useTravelStore((s) => s.trips);
  const allBookings = useTravelStore((s) => s.bookings);

  const trip = useMemo(
    () => trips.find((t) => t.id === activeTripId) ?? null,
    [trips, activeTripId],
  );

  /* Map each day-key to its 0-based index within the trip so we can
     consistently color pins regardless of how many bookings live on a
     given day. Pre-build a lookup map to keep the per-marker work O(1). */
  const dayIndexByKey = useMemo(() => {
    const m = new Map<string, number>();
    if (!trip) return m;
    tripDayKeys(trip).forEach((k, i) => m.set(k, i));
    return m;
  }, [trip]);

  const items = useMemo(() => {
    return allBookings
      .filter((b) => b.tripId === activeTripId)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      .map((b) => {
        const loc = bookingLocation(b);
        if (!loc) return null;
        const dayKey = bookingDayKey(b);
        /* Fallback to 0 if a booking somehow lands outside the trip's
           day range (shouldn't happen post-drag, but defend anyway). */
        const dayIdx = dayIndexByKey.get(dayKey) ?? 0;
        const color = colorForDayIndex(dayIdx);
        return {
          booking: b,
          dayIdx,
          color,
          ...loc,
        };
      })
      .filter(
        (
          x,
        ): x is {
          booking: Booking;
          dayIdx: number;
          color: string;
          lat: number;
          lng: number;
          label: string;
        } => x !== null,
      );
  }, [allBookings, activeTripId, dayIndexByKey]);

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
      >
        <TileLayer
          attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        <FitBounds points={points} focusedPoint={focusedPoint} />
        {items.map(({ booking, lat, lng, label, dayIdx, color }) => (
          <Marker
            key={booking.id}
            position={[lat, lng]}
            icon={buildIcon(color, dayIdx + 1, booking.id === focusedBookingId)}
            eventHandlers={{
              click: () => onBookingClick?.(booking.id),
            }}
          >
            <Popup>
              <PopupBody>
                <PopupTitle>{booking.title}</PopupTitle>
                <PopupMeta>
                  {TYPE_LABEL[booking.type]} · {formatTimeOfDay(booking.start)} · {label}
                </PopupMeta>
                <PopupDayChip $color={color}>Day {dayIdx + 1}</PopupDayChip>
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
