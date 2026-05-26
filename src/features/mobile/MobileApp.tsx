/**
 * Mobile shell — replaces TabPage on viewports ≤ 768px.
 *
 * Layout (top to bottom):
 *   - TopBar: brand mark, current "1 / 4" position, settings cog
 *   - TripPager: horizontal scroll-snap, one full-viewport page per
 *     trip. Order: upcoming (by startDate asc) then past (desc).
 *     Each page vertically scrolls its own Itinerary; IntersectionObserver
 *     syncs activeTripId to whichever page is currently centred.
 *   - ChatFab: bottom-right floating button → opens trip-scoped chat sheet.
 *   - ChatSheet: bottom sheet, hand-rolled drag-to-dismiss. Hosts the
 *     existing TripChatPanel.
 *   - SettingsSheet: tap cog → action list (Connections, Settings, Sign out).
 *     Each action opens a full-screen overlay reusing existing views.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { useTravelStore } from '@/features/travel/travel-store';
import Itinerary from '@/features/travel/Itinerary';
import TripMap from '@/features/travel/TripMap';
import TripChatPanel from '@/features/travel/TripChatPanel';
import BookingDetailModal from '@/features/travel/BookingDetailModal';
import { useFirebaseSync } from '@/features/travel/useFirebaseSync';
import { useBookingIngestion } from '@/features/travel/useBookingIngestion';
import { useChatRTDBMirror } from '@/features/travel/useChatRTDBMirror';
import { signOutFirebase } from '@/features/auth/firebase-auth';
import ConnectionsView from '@/features/settings/ConnectionsView';
import SettingsView from '@/features/settings/SettingsView';

const Root = styled.div`
  position: fixed;
  inset: 0;
  background: #fbfaf9;
  font-family: 'Inter', sans-serif;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const TopBar = styled.div`
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: max(8px, env(safe-area-inset-top)) 14px 8px;
  background: #fbfaf9;
  z-index: 30;
`;

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 16px;
  letter-spacing: -0.3px;
  color: #1F2421;
`;

const BrandMark = styled.div`
  width: 28px;
  height: 28px;
  border-radius: 14px;
  background: #FEEB29;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const Pos = styled.div`
  font-size: 11.5px;
  color: rgba(36, 36, 36, 0.5);
  font-variant-numeric: tabular-nums;
`;

const IconBtn = styled.button`
  width: 36px;
  height: 36px;
  border-radius: 18px;
  border: none;
  background: rgba(36, 36, 36, 0.06);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #1F2421;

  &:active { transform: scale(0.94); }
`;

const Pager = styled.div`
  flex: 1;
  display: flex;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
`;

const Page = styled.section`
  flex: 0 0 100%;
  height: 100%;
  scroll-snap-align: start;
  scroll-snap-stop: always;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  /* No padding on the page itself — the map needs to bleed edge-to-edge.
     Inner content gets its own horizontal padding via PageBody. */
`;

const StickyMapWrap = styled.div`
  position: sticky;
  top: 0;
  z-index: 5;
  background: #fbfaf9;
  /* Trim the embedded TripMap so it doesn't overflow the page on
     small screens, and KILL its built-in 16px corner radius so the
     edge-to-edge sticky strip doesn't look like a floating pill. */
  & > div {
    height: 200px;
    min-height: 200px;
    border-radius: 0;
  }
  /* Subtle hairline so the map separates from the itinerary that
     scrolls under it. */
  box-shadow: 0 1px 0 rgba(36, 36, 36, 0.08);
`;

const PageBody = styled.div`
  padding: 12px 14px calc(96px + env(safe-area-inset-bottom));
`;

const PastBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin: 4px 0 8px;
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(36, 36, 36, 0.06);
  color: rgba(36, 36, 36, 0.65);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

const Empty = styled.section`
  flex: 0 0 100%;
  height: 100%;
  scroll-snap-align: start;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;

  div {
    color: rgba(36, 36, 36, 0.55);
    font-size: 14px;
    text-align: center;
    max-width: 260px;
    line-height: 21px;
  }
  strong {
    display: block;
    color: #1F2421;
    font-size: 16px;
    margin-bottom: 6px;
    font-weight: 600;
  }
`;

const Fab = styled.button`
  position: fixed;
  bottom: calc(20px + env(safe-area-inset-bottom));
  right: 18px;
  width: 56px;
  height: 56px;
  border-radius: 28px;
  background: #242424;
  color: #fff;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  z-index: 40;

  &:active { transform: scale(0.94); }
`;

const SheetBackdrop = styled.div<{ $visible: boolean }>`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  opacity: ${(p) => (p.$visible ? 1 : 0)};
  pointer-events: ${(p) => (p.$visible ? 'auto' : 'none')};
  transition: opacity 0.2s ease;
  z-index: 50;
`;

const Sheet = styled.div<{ $offset: number; $closing: boolean }>`
  position: fixed;
  inset: 0 0 0 0;
  top: 56px;
  background: #fff;
  border-radius: 22px 22px 0 0;
  z-index: 60;
  display: flex;
  flex-direction: column;
  transform: translateY(${(p) => `${p.$offset}px`});
  transition: ${(p) => (p.$closing ? 'transform 0.22s ease-out' : 'none')};
  box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.18);
`;

const SheetHandle = styled.div`
  flex-shrink: 0;
  padding: 10px 0 6px;
  display: flex;
  justify-content: center;
  touch-action: none;
  cursor: grab;
  &::after {
    content: '';
    display: block;
    width: 42px;
    height: 5px;
    border-radius: 3px;
    background: rgba(36, 36, 36, 0.15);
  }
`;

const SheetBody = styled.div`
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const ActionSheet = styled.div<{ $visible: boolean }>`
  position: fixed;
  left: 12px;
  right: 12px;
  bottom: calc(16px + env(safe-area-inset-bottom));
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.18);
  z-index: 60;
  padding: 6px;
  transform: translateY(${(p) => (p.$visible ? '0' : '20px')});
  opacity: ${(p) => (p.$visible ? 1 : 0)};
  pointer-events: ${(p) => (p.$visible ? 'auto' : 'none')};
  transition: transform 0.18s ease, opacity 0.18s ease;
`;

const ActionItem = styled.button`
  display: block;
  width: 100%;
  padding: 14px 16px;
  border: none;
  background: transparent;
  text-align: left;
  font-family: inherit;
  font-size: 15px;
  color: #1F2421;
  border-radius: 10px;
  cursor: pointer;

  & + & {
    border-top: 1px solid rgba(36, 36, 36, 0.06);
    border-radius: 0;
  }
  &:last-child {
    border-radius: 0 0 10px 10px;
    color: #b91c1c;
  }
  &:first-child {
    border-radius: 10px 10px 0 0;
  }
  &:active { background: rgba(36, 36, 36, 0.04); }
`;

const FullscreenOverlay = styled.div<{ $visible: boolean }>`
  position: fixed;
  inset: 0;
  background: #fbfaf9;
  z-index: 70;
  transform: translateX(${(p) => (p.$visible ? '0' : '100%')});
  transition: transform 0.22s ease;
  display: flex;
  flex-direction: column;
`;

const OverlayHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: max(10px, env(safe-area-inset-top)) 16px 10px;
  border-bottom: 1px solid rgba(36, 36, 36, 0.06);
`;

const BackBtn = styled.button`
  background: transparent;
  border: none;
  cursor: pointer;
  width: 36px;
  height: 36px;
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #1F2421;
  &:active { background: rgba(36, 36, 36, 0.06); }
`;

const OverlayTitle = styled.h1`
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1F2421;
`;

const OverlayBody = styled.div`
  flex: 1;
  overflow-y: auto;
`;

/* SVG paths */
const PaperPlaneIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="#242424">
    <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
  </svg>
);
const CogIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);
const ChatBubbleIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
const BackArrow = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

/* ─────────────────────────────────────────────────────────────── */

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const MobileApp: React.FC = () => {
  /* Same side-effect hooks TripsView mounts on desktop. Without these
     the local travel-store stays empty: useFirebaseSync hydrates trips
     + bookings from RTDB and mirrors local changes back; useBookingIngestion
     listens for trips/v1 + bookings/v1 blocks in chat replies. */
  useFirebaseSync();
  useBookingIngestion();
  useChatRTDBMirror();

  const trips = useTravelStore((s) => s.trips);
  const setActiveTrip = useTravelStore((s) => s.setActiveTrip);
  const activeTripId = useTravelStore((s) => s.activeTripId);

  /* Order pages: upcoming (start ≥ today, asc), then past (desc). */
  const { upcoming, past } = useMemo(() => {
    const t = todayYmd();
    const u: typeof trips = [];
    const p: typeof trips = [];
    for (const trip of trips) {
      if (trip.endDate >= t) u.push(trip);
      else p.push(trip);
    }
    u.sort((a, b) => a.startDate.localeCompare(b.startDate));
    p.sort((a, b) => b.startDate.localeCompare(a.startDate));
    return { upcoming: u, past: p };
  }, [trips]);

  const orderedTrips = useMemo(() => [...upcoming, ...past], [upcoming, past]);
  const totalPages = orderedTrips.length;
  const pastStartIdx = upcoming.length;

  /* Track which page is centred via IntersectionObserver. */
  const pagerRef = useRef<HTMLDivElement | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  useEffect(() => {
    const pager = pagerRef.current;
    if (!pager) return;
    const pages = pager.querySelectorAll<HTMLElement>('[data-trip-page]');
    if (pages.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let bestIdx = activeIdx;
        let bestRatio = 0;
        for (const e of entries) {
          if (e.intersectionRatio > bestRatio) {
            bestRatio = e.intersectionRatio;
            const idx = Number((e.target as HTMLElement).dataset.tripIdx);
            if (!Number.isNaN(idx)) bestIdx = idx;
          }
        }
        if (bestRatio > 0.5) setActiveIdx(bestIdx);
      },
      { root: pager, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    pages.forEach((p) => observer.observe(p));
    return () => observer.disconnect();
  }, [orderedTrips.length, activeIdx]);

  /* Sync travel-store activeTripId to the currently-visible trip page. */
  useEffect(() => {
    const trip = orderedTrips[activeIdx];
    if (trip && trip.id !== activeTripId) {
      setActiveTrip(trip.id);
    }
  }, [activeIdx, orderedTrips, activeTripId, setActiveTrip]);

  /* Chat sheet drag-to-dismiss. */
  const [chatOpen, setChatOpen] = useState(false);
  const [sheetOffset, setSheetOffset] = useState(0);
  const [sheetClosing, setSheetClosing] = useState(false);
  const dragStartY = useRef<number | null>(null);
  const sheetHeight = typeof window !== 'undefined' ? window.innerHeight - 56 : 800;

  const openChat = () => {
    setSheetClosing(true);
    setSheetOffset(0);
    setChatOpen(true);
  };
  const closeChat = () => {
    setSheetClosing(true);
    setSheetOffset(sheetHeight);
    setTimeout(() => {
      setChatOpen(false);
      setSheetOffset(0);
    }, 220);
  };

  const onHandleStart = (e: React.PointerEvent) => {
    dragStartY.current = e.clientY;
    setSheetClosing(false);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: React.PointerEvent) => {
    if (dragStartY.current === null) return;
    const dy = Math.max(0, e.clientY - dragStartY.current);
    setSheetOffset(dy);
  };
  const onHandleEnd = () => {
    if (dragStartY.current === null) return;
    dragStartY.current = null;
    if (sheetOffset > 120) {
      closeChat();
    } else {
      setSheetClosing(true);
      setSheetOffset(0);
    }
  };

  /* Settings action sheet + overlays. */
  const [actionsOpen, setActionsOpen] = useState(false);
  const [overlay, setOverlay] = useState<'connections' | 'settings' | null>(null);

  /* Selected booking → renders BookingDetailModal as a bottom sheet
     (the modal's own @media (max-width: 600px) styles handle the
     iOS-native bottom-anchored look). */
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const allBookings = useTravelStore((s) => s.bookings);
  const selectedBooking = useMemo(
    () => allBookings.find((b) => b.id === selectedBookingId) ?? null,
    [allBookings, selectedBookingId],
  );

  /* Scroll-spy: the topmost-visible booking card as the user scrolls
     vertically inside a trip page. Used to pan the sticky map so it
     stays focused on whatever the user is looking at. Selected (tapped)
     booking takes priority over scroll focus. */
  const [scrollFocusedBookingId, setScrollFocusedBookingId] = useState<string | null>(null);
  const mapFocusBookingId = selectedBookingId ?? scrollFocusedBookingId;

  /* Deep-link from URL — runs once when trips first hydrate. When the
     page loads at /trip/<tripId> (e.g. from an iMessage rich-link tap),
     this scrolls the carousel to that trip's page. If the URL also has
     a #booking=<id> hash, it expands that booking inside the trip so
     the user lands on the specific item they came for. The existing
     IntersectionObserver picks up the resulting scroll and updates
     activeIdx → activeTripId, so no manual setActiveTrip call needed. */
  const deepLinkAppliedRef = useRef(false);
  useEffect(() => {
    if (deepLinkAppliedRef.current) return;
    if (orderedTrips.length === 0) return;

    const match = window.location.pathname.match(/^\/trip\/([^/]+)$/);
    if (!match) {
      deepLinkAppliedRef.current = true;
      return;
    }
    const tripId = decodeURIComponent(match[1]);
    const idx = orderedTrips.findIndex((t) => t.id === tripId);
    if (idx === -1) {
      deepLinkAppliedRef.current = true;
      return;
    }
    deepLinkAppliedRef.current = true;

    /* Direct scrollLeft skips the smooth-scroll animation so the user
       lands directly on the target trip instead of watching the
       carousel sweep through every page in between. */
    const pager = pagerRef.current;
    if (pager) pager.scrollLeft = idx * pager.clientWidth;

    const hashMatch = window.location.hash.match(/^#booking=([^&]+)$/);
    if (hashMatch) {
      /* Delay so the carousel page has rendered before the BookingCard's
         existing scroll-into-view effect fires. */
      const bookingId = decodeURIComponent(hashMatch[1]);
      setTimeout(() => setSelectedBookingId(bookingId), 250);
    }
  }, [orderedTrips]);

  /* Positions / labels for the top bar. */
  const pageLabel =
    totalPages === 0
      ? 'No trips'
      : `${activeIdx + 1} / ${totalPages}`;

  return (
    <Root>
      <TopBar>
        <Brand>
          <BrandMark>
            <PaperPlaneIcon />
          </BrandMark>
          Wanderbot
        </Brand>
        <Pos>{pageLabel}</Pos>
        <IconBtn aria-label="Settings" onClick={() => setActionsOpen(true)}>
          <CogIcon />
        </IconBtn>
      </TopBar>

      <Pager ref={pagerRef}>
        {totalPages === 0 ? (
          <Empty>
            <div>
              <strong>No trips yet</strong>
              Connect Gmail and ask the assistant to scan your inbox — your trips will appear here.
            </div>
          </Empty>
        ) : (
          orderedTrips.map((trip, i) => {
            const isPast = i >= pastStartIdx;
            return (
              <Page key={trip.id} data-trip-page data-trip-idx={i}>
                <StickyMapWrap>
                  <TripMap
                    tripId={trip.id}
                    focusedBookingId={mapFocusBookingId}
                    onBookingClick={setSelectedBookingId}
                  />
                </StickyMapWrap>
                <PageBody>
                  {isPast && <PastBadge>Past trip</PastBadge>}
                  {/* Deliberately NOT passing focusedBookingId or
                      onCollapseBooking — on mobile the bottom-sheet
                      BookingDetailModal is the only edit surface.
                      Passing focusedBookingId would also expand the
                      inline BookingCard editor, leaving two editors
                      stacked (the dimmed form visible behind the
                      sheet). */}
                  <Itinerary
                    tripId={trip.id}
                    onBookingClick={setSelectedBookingId}
                    onScrollFocus={setScrollFocusedBookingId}
                  />
                </PageBody>
              </Page>
            );
          })
        )}
      </Pager>

      <Fab aria-label="Open chat" onClick={openChat}>
        <ChatBubbleIcon />
      </Fab>

      <SheetBackdrop $visible={chatOpen} onClick={closeChat} />
      {chatOpen && (
        <Sheet $offset={sheetOffset} $closing={sheetClosing}>
          <SheetHandle
            onPointerDown={onHandleStart}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleEnd}
            onPointerCancel={onHandleEnd}
          />
          <SheetBody>
            <TripChatPanel />
          </SheetBody>
        </Sheet>
      )}

      <SheetBackdrop $visible={actionsOpen} onClick={() => setActionsOpen(false)} />
      <ActionSheet $visible={actionsOpen}>
        <ActionItem
          onClick={() => {
            setActionsOpen(false);
            setOverlay('connections');
          }}
        >
          Connections
        </ActionItem>
        <ActionItem
          onClick={() => {
            setActionsOpen(false);
            setOverlay('settings');
          }}
        >
          Settings
        </ActionItem>
        <ActionItem
          onClick={() => {
            setActionsOpen(false);
            void signOutFirebase();
          }}
        >
          Sign out
        </ActionItem>
      </ActionSheet>

      <FullscreenOverlay $visible={overlay !== null}>
        <OverlayHeader>
          <BackBtn aria-label="Back" onClick={() => setOverlay(null)}>
            <BackArrow />
          </BackBtn>
          <OverlayTitle>
            {overlay === 'connections' ? 'Connections' : 'Settings'}
          </OverlayTitle>
        </OverlayHeader>
        <OverlayBody>
          {overlay === 'connections' && <ConnectionsView />}
          {overlay === 'settings' && <SettingsView />}
        </OverlayBody>
      </FullscreenOverlay>

      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          onClose={() => setSelectedBookingId(null)}
        />
      )}
    </Root>
  );
};

export default MobileApp;
