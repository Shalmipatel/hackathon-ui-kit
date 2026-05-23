/**
 * AddToHomeScreenBanner — iOS Safari install prompt.
 *
 * iOS has no JavaScript API to trigger "Add to Home Screen" (Safari doesn't
 * support `beforeinstallprompt`). The banner's button opens an instruction
 * overlay with visual cues to Safari's Share → Add to Home Screen flow.
 *
 * Once installed, the `apple-mobile-web-app-capable` meta tag in index.html
 * ensures the home-screen icon opens the app in standalone mode (no address
 * bar, no Safari chrome).
 */

import React, { useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import { useA2HSStore } from './a2hs-store';

/**
 * Banner dismissal is per-page-load only (in-memory state).
 * There is no localStorage persistence — the user will see the banner
 * every time they refresh the page until they actually install the PWA.
 * Once installed (standalone mode), eligibility goes false and the
 * banner stays hidden forever. Eligibility checks live in `a2hs-store.ts`.
 */

/*
 * Bottom-anchored banner that slides up from below. It deliberately
 * overlays the NewChatFab / CreateEventFab when visible — a high z-index
 * wins the corner so the "install app" prompt is the focal point while
 * it's up; the FAB returns to view as soon as the banner is dismissed or
 * once the app is installed (banner eligibility flips false).
 */
const slideUp = keyframes`
  from { transform: translateY(100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
`;

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const Banner = styled.button`
  position: fixed;
  left: 12px;
  right: 12px;
  bottom: calc(env(safe-area-inset-bottom, 0) + 12px);
  z-index: 9998;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 36px 14px 14px; /* extra right padding to avoid × overlap */
  background: #242424;
  color: white;
  border: none;
  border-radius: 16px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
  animation: ${slideUp} 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  font-family: 'Inter', sans-serif;
  cursor: pointer;
  text-align: left;
  width: auto;
  transition: transform 0.15s ease, background 0.15s ease;
  &:hover { background: #333; }
  &:active { transform: scale(0.985); background: #1a1a1a; }
`;

const BannerIcon = styled.div`
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 10px;
  background: #FEEB29;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const BannerText = styled.div`
  flex: 1;
  min-width: 0;
`;

const BannerTitle = styled.div`
  font-size: 14px;
  font-weight: 700;
  line-height: 18px;
`;

const BannerSubtitle = styled.div`
  font-size: 12px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
  line-height: 16px;
`;

const CloseBtn = styled.button`
  position: absolute;
  top: 6px;
  right: 6px;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: rgba(255, 255, 255, 0.55);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  line-height: 1;
  padding: 0;
  /* Extend the tap target beyond the visible icon */
  &::after {
    content: '';
    position: absolute;
    inset: -10px;
  }
  &:hover { color: white; }
  &:active { color: white; transform: scale(0.9); }
`;

/* ── Instruction overlay pinned to the TOP half of the screen.
      iOS share sheet slides up from the bottom and covers ~60% of the
      viewport; our overlay lives above it so the user sees the animated
      demo while picking the option in the share sheet below. ── */

const TopHalfOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  padding: calc(env(safe-area-inset-top, 0) + 24px) 12px 24px;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  /* Darken + blur the page behind the overlay so the instruction card is
     the clear focal point. Tap anywhere outside the card to dismiss. */
  background: rgba(20, 20, 20, 0.45);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  animation: ${fadeIn} 0.22s ease;
  cursor: pointer;
`;

const InstructionCard = styled.div`
  width: 100%;
  max-width: 440px;
  background: white;
  border-radius: 20px;
  padding: 16px 16px 20px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
  font-family: 'Inter', sans-serif;
  pointer-events: auto;
  animation: ${slideUp} 0.35s cubic-bezier(0.16, 1, 0.3, 1);
`;

const InstructionTitle = styled.h2`
  font-size: 17px;
  font-weight: 800;
  color: #242424;
  margin: 0 0 4px;
  text-align: center;
`;

const InstructionSub = styled.p`
  font-size: 13px;
  font-weight: 500;
  color: rgba(36, 36, 36, 0.65);
  margin: 0 0 14px;
  text-align: center;
  line-height: 18px;
`;

const InstructionClose = styled.button`
  width: 100%;
  height: 38px;
  margin-top: 14px;
  border: none;
  border-radius: 19px;
  background: rgba(36, 36, 36, 0.08);
  color: #242424;
  font-family: 'Inter', sans-serif;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  pointer-events: auto;
  &:active { background: rgba(36, 36, 36, 0.14); }
`;

/* ── Animated demo: three-scene loop showing the full iOS flow:
      1. Tap the ••• (three dots) in Safari's toolbar
      2. Tap "More" in the page-actions menu that opens
      3. Scroll the list and tap "Add to Home Screen"              ── */

const DEMO_DURATION = 10; /* seconds for a full cycle (4 scenes × 2.5s) */

const DemoFrame = styled.div`
  position: relative;
  height: 240px;
  border-radius: 16px;
  /* Subtle wallpaper gradient so the mock chrome reads like it's floating
     over real page content (mimics Safari's translucent toolbar background). */
  background:
    linear-gradient(180deg, #e8e8e6 0%, #dddcd8 100%),
    rgba(240, 240, 238, 0.95);
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgba(36, 36, 36, 0.06);
`;

const SceneLabel = styled.div`
  font-size: 10px;
  font-weight: 700;
  color: rgba(36, 36, 36, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
`;

/* Scene A (0–25%) — Safari bottom toolbar with URL pill + ••• button */
const sceneA = keyframes`
  0%, 22% { opacity: 1; transform: translateX(0); }
  25%, 100% { opacity: 0; transform: translateX(-30px); }
`;
const SceneA = styled.div`
  position: absolute;
  inset: 0;
  padding: 12px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  animation: ${sceneA} ${DEMO_DURATION}s ease-in-out infinite;
`;

/* Mock Safari bottom chrome — matches iOS 17+ floating pill layout:
   circular back button, URL pill with lock+domain+reload, circular ••• */
const SafariToolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: rgba(250, 249, 248, 0.96);
  border-radius: 16px;
  backdrop-filter: blur(10px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08),
              0 1px 2px rgba(0, 0, 0, 0.06);
  border: 0.5px solid rgba(36, 36, 36, 0.08);
`;

const CircleBtn = styled.div<{ $highlight?: boolean }>`
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${p => p.$highlight ? '#0a84ff' : 'rgba(36, 36, 36, 0.85)'};
  background: ${p => p.$highlight
    ? 'rgba(10, 132, 255, 0.15)'
    : 'rgba(36, 36, 36, 0.06)'};
  border: 1.5px solid ${p => p.$highlight ? '#0a84ff' : 'transparent'};
  box-shadow: ${p => p.$highlight
    ? '0 0 0 3px rgba(10, 132, 255, 0.12)'
    : 'none'};
`;

const URLPill = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  background: rgba(36, 36, 36, 0.06);
  border-radius: 18px;
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
  font-size: 12px;
  font-weight: 500;
  color: #242424;
  position: relative;
`;

const URLLock = styled.span`
  color: rgba(36, 36, 36, 0.5);
  display: inline-flex;
`;

const URLRefresh = styled.span`
  position: absolute;
  right: 10px;
  color: rgba(36, 36, 36, 0.45);
  display: inline-flex;
`;

/* Scene B (25–50%) — Safari page-actions popover with "Share" highlighted */
const sceneB = keyframes`
  0%, 22%  { opacity: 0; transform: translateX(30px); }
  25%, 47% { opacity: 1; transform: translateX(0); }
  50%, 100% { opacity: 0; transform: translateX(-30px); }
`;
const SceneB = styled.div`
  position: absolute;
  inset: 0;
  padding: 12px;
  animation: ${sceneB} ${DEMO_DURATION}s ease-in-out infinite;
`;

/* Scene C (50–75%) — Share sheet: app row + action row with "View More" highlighted */
const sceneC = keyframes`
  0%, 47%  { opacity: 0; transform: translateX(30px); }
  50%, 72% { opacity: 1; transform: translateX(0); }
  75%, 100% { opacity: 0; transform: translateX(-30px); }
`;
const SceneC = styled.div`
  position: absolute;
  inset: 0;
  padding: 12px;
  animation: ${sceneC} ${DEMO_DURATION}s ease-in-out infinite;
`;

/* Scene D (75–100%) — Expanded share sheet list, scrolls to reveal
   "Add to Home Screen" highlighted yellow. */
const sceneD = keyframes`
  0%, 72%   { opacity: 0; transform: translateX(30px); }
  75%, 100% { opacity: 1; transform: translateX(0); }
`;
const SceneD = styled.div`
  position: absolute;
  inset: 0;
  padding: 12px;
  animation: ${sceneD} ${DEMO_DURATION}s ease-in-out infinite;
`;

/* Inside Scene D, the vertical list scrolls up to reveal Add to Home Screen. */
const listScroll = keyframes`
  0%, 78%   { transform: translateY(0); }
  88%, 100% { transform: translateY(-88px); }
`;
const VList = styled.div`
  position: relative;
  height: 184px;
  overflow: hidden;
  background: white;
  border-radius: 10px;
  border: 1px solid rgba(36, 36, 36, 0.08);
`;
const VListScroll = styled.div`
  animation: ${listScroll} ${DEMO_DURATION}s ease-in-out infinite;
`;

const VRow = styled.div<{ $highlight?: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(36, 36, 36, 0.06);
  background: ${p => p.$highlight ? 'rgba(254, 235, 41, 0.35)' : 'transparent'};
`;

const VRowIcon = styled.div<{ $highlight?: boolean }>`
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: ${p => p.$highlight ? '#FEEB29' : 'rgba(36, 36, 36, 0.06)'};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: ${p => p.$highlight ? '#242424' : 'rgba(36, 36, 36, 0.55)'};
`;

const VRowLabel = styled.span<{ $highlight?: boolean }>`
  flex: 1;
  font-size: 12px;
  font-weight: ${p => p.$highlight ? 700 : 500};
  color: ${p => p.$highlight ? '#242424' : 'rgba(36, 36, 36, 0.75)'};
`;

/* iOS popover card — white, rounded, with subtle outer shadow + divider
   lines between rows (like Safari's context menu above the ••• button). */
const MenuCard = styled.div`
  background: rgba(252, 252, 250, 0.98);
  backdrop-filter: blur(20px);
  border-radius: 14px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.15),
              0 2px 6px rgba(0, 0, 0, 0.08);
  border: 0.5px solid rgba(36, 36, 36, 0.08);
  overflow: hidden;
`;

const MoreRow = styled.div<{ $highlight?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 16px;
  /* Subtle top hairline divider between rows (not on first) */
  & + & { border-top: 0.5px solid rgba(36, 36, 36, 0.1); }
  background: ${p => p.$highlight ? 'rgba(10, 132, 255, 0.12)' : 'transparent'};
`;

const MoreLabel = styled.span<{ $highlight?: boolean }>`
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
  font-size: 15px;
  font-weight: ${p => p.$highlight ? 600 : 400};
  color: ${p => p.$highlight ? '#0a84ff' : '#242424'};
`;

const MoreChevron = styled.span<{ $highlight?: boolean }>`
  color: ${p => p.$highlight ? '#0a84ff' : 'rgba(36, 36, 36, 0.55)'};
  display: inline-flex;
`;

/* iOS Share sheet mock — frosted white card with header, app row, action
   row. Matches the look of Safari's native share modal. */
const ShareSheetCard = styled.div`
  background: rgba(252, 252, 250, 0.98);
  backdrop-filter: blur(20px);
  border-radius: 14px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.12);
  border: 0.5px solid rgba(36, 36, 36, 0.08);
`;

const ShareHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 2px 2px 8px;
  border-bottom: 0.5px solid rgba(36, 36, 36, 0.08);
`;

const ShareTitle = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
`;

const ShareTitlePrimary = styled.div`
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 700;
  color: #242424;
`;

const ShareTitleSecondary = styled.div`
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
  font-size: 10px;
  color: rgba(36, 36, 36, 0.5);
`;

const ShareOptions = styled.div`
  font-size: 10px;
  font-weight: 500;
  color: #0a84ff;
  padding: 3px 8px;
  border-radius: 10px;
  background: rgba(36, 36, 36, 0.06);
`;

const AppRow = styled.div`
  display: flex;
  gap: 4px;
`;

const AppTile = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
`;

const AppIcon = styled.div<{ $bg?: string }>`
  width: 100%;
  aspect-ratio: 1;
  max-width: 44px;
  border-radius: 11px;
  background: ${p => p.$bg ?? 'white'};
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
`;

const AppLabel = styled.span`
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
  font-size: 9px;
  font-weight: 500;
  color: rgba(36, 36, 36, 0.75);
`;

const ActionTileRow = styled.div`
  display: flex;
  gap: 4px;
  padding-top: 8px;
  border-top: 0.5px solid rgba(36, 36, 36, 0.08);
`;

const ActionTile = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
`;

const ActionTileIcon = styled.div<{ $highlight?: boolean }>`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: ${p => p.$highlight
    ? 'rgba(10, 132, 255, 0.15)'
    : 'rgba(36, 36, 36, 0.08)'};
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${p => p.$highlight ? '#0a84ff' : '#242424'};
  border: 1.5px solid ${p => p.$highlight ? '#0a84ff' : 'transparent'};
  box-shadow: ${p => p.$highlight ? '0 0 0 3px rgba(10, 132, 255, 0.12)' : 'none'};
`;

const ActionTileLabel = styled.span<{ $highlight?: boolean }>`
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
  font-size: 9px;
  font-weight: ${p => p.$highlight ? 600 : 500};
  color: ${p => p.$highlight ? '#0a84ff' : 'rgba(36, 36, 36, 0.65)'};
  text-align: center;
  line-height: 11px;
`;

/* App brand square used as the share-sheet header icon */
const ShieldTile = styled.div`
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 8px;
  background: #FEEB29;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
`;

/* Finger animation — moves through four target positions across the cycle.
   Coordinates are relative to DemoFrame (240px tall × ~380px wide). */
const fingerJourney = keyframes`
  /* Scene A (0–22%): tap ••• circle button — bottom-right of the Safari
     toolbar. Toolbar sits at the BOTTOM of the frame (~85% y), the ••• is
     the rightmost circle button (~88% x). */
  0%        { opacity: 0; left: 88%; top: 85%; transform: translate(-50%, 18px) scale(0.9); }
  4%        { opacity: 1; left: 88%; top: 85%; transform: translate(-50%, 0) scale(1); }
  10%       { opacity: 1; left: 88%; top: 85%; transform: translate(-50%, 0) scale(0.82); }
  16%       { opacity: 1; left: 88%; top: 85%; transform: translate(-50%, 0) scale(1); }
  22%       { opacity: 0; left: 88%; top: 85%; transform: translate(-50%, 0) scale(1); }

  /* Scene B (25–47%): tap "Share" — first row of popover menu. Menu card
     sits just below the label (~22% y), Share row is the top row. */
  27%       { opacity: 0; left: 50%; top: 22%; transform: translate(-50%, 18px) scale(0.9); }
  31%       { opacity: 1; left: 50%; top: 22%; transform: translate(-50%, 0) scale(1); }
  37%       { opacity: 1; left: 50%; top: 22%; transform: translate(-50%, 0) scale(0.82); }
  43%       { opacity: 1; left: 50%; top: 22%; transform: translate(-50%, 0) scale(1); }
  47%       { opacity: 0; left: 50%; top: 22%; transform: translate(-50%, 0) scale(1); }

  /* Scene C (50–72%): tap "View More" — last action tile in the action row.
     Action row is at the BOTTOM of the share-sheet card (~82% y).
     4th of 4 tiles horizontally (~88% x). */
  52%       { opacity: 0; left: 88%; top: 82%; transform: translate(-50%, 18px) scale(0.9); }
  56%       { opacity: 1; left: 88%; top: 82%; transform: translate(-50%, 0) scale(1); }
  62%       { opacity: 1; left: 88%; top: 82%; transform: translate(-50%, 0) scale(0.82); }
  68%       { opacity: 1; left: 88%; top: 82%; transform: translate(-50%, 0) scale(1); }
  72%       { opacity: 0; left: 88%; top: 82%; transform: translate(-50%, 0) scale(1); }

  /* Scene D (75–100%): tap "Add to Home Screen" after list scrolls up.
     After the -88px scroll, the highlighted row sits around mid-list (~48% y). */
  77%       { opacity: 0; left: 50%; top: 48%; transform: translate(-50%, 18px) scale(0.9); }
  88%       { opacity: 1; left: 50%; top: 48%; transform: translate(-50%, 0) scale(1); }
  92%       { opacity: 1; left: 50%; top: 48%; transform: translate(-50%, 0) scale(0.82); }
  97%       { opacity: 1; left: 50%; top: 48%; transform: translate(-50%, 0) scale(1); }
  100%      { opacity: 0; left: 50%; top: 48%; transform: translate(-50%, 0) scale(1); }
`;

const Finger = styled.div`
  position: absolute;
  pointer-events: none;
  font-size: 32px;
  line-height: 1;
  z-index: 2;
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3));
  animation: ${fingerJourney} ${DEMO_DURATION}s cubic-bezier(0.4, 0, 0.2, 1) infinite;
`;

const InstructionCaption = styled.div`
  font-size: 13px;
  font-weight: 700;
  color: #242424;
  text-align: center;
  margin-top: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  strong { color: #242424; }
`;


/* Shield icon matching the app's onboarding logo */
const AppShieldIcon: React.FC = () => (
  <svg width="24" height="24" viewBox="0 0 36 36" fill="none">
    <path d="M18 4.5l11 4.3v9.5c0 5.8-3.7 10.8-11 13.2-7.3-2.4-11-7.4-11-13.2V8.8L18 4.5Z" fill="#242424" />
    <path d="M12.4 17.6 16.4 22 25 12.2" stroke="#FEEB29" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PlusSquareIcon: React.FC = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <line x1="12" y1="8" x2="12" y2="16" />
    <line x1="8" y1="12" x2="16" y2="12" />
  </svg>
);

const CopyIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const BookmarkIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
);

const FindIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const PrintIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 6 2 18 2 18 9" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" />
  </svg>
);

export const AddToHomeScreenBanner: React.FC = () => {
  const eligible = useA2HSStore((s) => s.eligible);
  const bannerDismissed = useA2HSStore((s) => s.bannerDismissed);
  const sheetOpen = useA2HSStore((s) => s.overlayOpen);
  const dismissBanner = useA2HSStore((s) => s.dismissBanner);
  const openOverlay = useA2HSStore((s) => s.openOverlay);
  const closeOverlay = useA2HSStore((s) => s.closeOverlay);

  // The banner is visible when the user is eligible AND hasn't dismissed it
  // this session AND the overlay isn't currently up.
  const visible = eligible && !bannerDismissed;

  const handleSnooze = useCallback(() => {
    dismissBanner();
  }, [dismissBanner]);

  const setSheetOpen = useCallback((open: boolean) => {
    if (open) openOverlay();
    else closeOverlay();
  }, [openOverlay, closeOverlay]);

  const handleAdd = useCallback(() => {
    // Opening the overlay also marks the banner dismissed (store action)
    // so the banner and overlay never stack on top of each other.
    openOverlay();
  }, [openOverlay]);

  // Render if the banner is visible OR the instruction overlay is open.
  // (Clicking the banner hides it AND opens the overlay simultaneously.)
  if (!visible && !sheetOpen) return null;

  return (
    <>
      {visible && (
        <Banner
          type="button"
          aria-label="Add this app to home screen"
          onClick={handleAdd}
        >
          <BannerIcon><AppShieldIcon /></BannerIcon>
          <BannerText>
            <BannerTitle>Add app to home screen</BannerTitle>
            <BannerSubtitle>Get the app experience on your phone</BannerSubtitle>
          </BannerText>
          <CloseBtn
            onClick={(e) => { e.stopPropagation(); handleSnooze(); }}
            aria-label="Dismiss"
          >
            ×
          </CloseBtn>
        </Banner>
      )}

      {sheetOpen && (
        <TopHalfOverlay onClick={() => setSheetOpen(false)}>
          <InstructionCard onClick={(e) => e.stopPropagation()}>
            <InstructionTitle>Install the app on your iPhone</InstructionTitle>
            <InstructionSub>
              Tap the <strong>Share</strong> icon (<svg width="12" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', verticalAlign: 'middle', margin: '0 2px' }}><path d="M12 2v14" /><path d="m6 8 6-6 6 6" /><path d="M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8" /></svg>) in Safari's toolbar, then:
            </InstructionSub>

            <DemoFrame>
              {/* Scene A: Safari's bottom toolbar — tap the ••• button */}
              <SceneA>
                <SceneLabel>Step 1 · Tap the ••• in Safari</SceneLabel>
                <SafariToolbar>
                  <CircleBtn>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                  </CircleBtn>
                  <URLPill>
                    <URLLock>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                    </URLLock>
                    your-assistant.app
                    <URLRefresh>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
                    </URLRefresh>
                  </URLPill>
                  <CircleBtn $highlight>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
                  </CircleBtn>
                </SafariToolbar>
              </SceneA>

              {/* Scene B: popover menu that appears above ••• — tap "Share" */}
              <SceneB>
                <SceneLabel>Step 2 · Tap "Share"</SceneLabel>
                <MenuCard>
                  <MoreRow $highlight>
                    <MoreLabel $highlight>Share</MoreLabel>
                    <MoreChevron $highlight>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v14" /><path d="m6 8 6-6 6 6" /><path d="M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8" /></svg>
                    </MoreChevron>
                  </MoreRow>
                  <MoreRow>
                    <MoreLabel>Add Bookmark to…</MoreLabel>
                    <MoreChevron>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
                    </MoreChevron>
                  </MoreRow>
                  <MoreRow>
                    <MoreLabel>New Tab</MoreLabel>
                    <MoreChevron>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                    </MoreChevron>
                  </MoreRow>
                </MenuCard>
              </SceneB>

              {/* Scene C: Safari share sheet — apps row + action row with
                  "View More" highlighted at the end. */}
              <SceneC>
                <SceneLabel>Step 3 · Tap "View More"</SceneLabel>
                <ShareSheetCard>
                  <ShareHeader>
                    <ShieldTile><AppShieldIcon /></ShieldTile>
                    <ShareTitle>
                      <ShareTitlePrimary>AI Assistant</ShareTitlePrimary>
                      <ShareTitleSecondary>localhost</ShareTitleSecondary>
                    </ShareTitle>
                    <ShareOptions>Options ›</ShareOptions>
                  </ShareHeader>
                  <AppRow>
                    <AppTile>
                      <AppIcon $bg="linear-gradient(135deg, #ff453a 0%, #ff6b55 100%)">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.02 2 11c0 2.8 1.41 5.28 3.63 6.92L5 22l4.37-2.13C10.26 20 11.12 20 12 20c5.52 0 10-4.02 10-9s-4.48-9-10-9z" /></svg>
                      </AppIcon>
                      <AppLabel>Messages</AppLabel>
                    </AppTile>
                    <AppTile>
                      <AppIcon $bg="linear-gradient(135deg, #0a84ff 0%, #5ac8fa 100%)">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
                      </AppIcon>
                      <AppLabel>Mail</AppLabel>
                    </AppTile>
                    <AppTile>
                      <AppIcon $bg="linear-gradient(135deg, #ffd60a 0%, #ffa500 100%)">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="7" r="3" /><circle cx="16" cy="7" r="3" /><circle cx="8" cy="17" r="3" /><circle cx="16" cy="17" r="3" /></svg>
                      </AppIcon>
                      <AppLabel>Reminders</AppLabel>
                    </AppTile>
                    <AppTile>
                      <AppIcon $bg="rgba(36, 36, 36, 0.08)" style={{ color: 'rgba(36, 36, 36, 0.75)' }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
                      </AppIcon>
                      <AppLabel>More</AppLabel>
                    </AppTile>
                  </AppRow>
                  <ActionTileRow>
                    <ActionTile>
                      <ActionTileIcon><CopyIcon /></ActionTileIcon>
                      <ActionTileLabel>Copy</ActionTileLabel>
                    </ActionTile>
                    <ActionTile>
                      <ActionTileIcon><BookmarkIcon /></ActionTileIcon>
                      <ActionTileLabel>Bookmark</ActionTileLabel>
                    </ActionTile>
                    <ActionTile>
                      <ActionTileIcon>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="15" r="4" /><circle cx="18" cy="15" r="4" /><path d="M10 15a2 2 0 0 1 4 0" /></svg>
                      </ActionTileIcon>
                      <ActionTileLabel>Reading List</ActionTileLabel>
                    </ActionTile>
                    <ActionTile>
                      <ActionTileIcon $highlight>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                      </ActionTileIcon>
                      <ActionTileLabel $highlight>View More</ActionTileLabel>
                    </ActionTile>
                  </ActionTileRow>
                </ShareSheetCard>
              </SceneC>

              {/* Scene D: expanded action list, scrolls up to reveal A2HS */}
              <SceneD>
                <SceneLabel>Step 4 · Tap Add to Home Screen</SceneLabel>
                <VList>
                  <VListScroll>
                    <VRow>
                      <VRowIcon><BookmarkIcon /></VRowIcon>
                      <VRowLabel>Add Bookmark to…</VRowLabel>
                    </VRow>
                    <VRow>
                      <VRowIcon>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15 8.5 22 9.3 17 14 18.5 21 12 17.8 5.5 21 7 14 2 9.3 9 8.5 12 2" /></svg>
                      </VRowIcon>
                      <VRowLabel>Add to Favorites</VRowLabel>
                    </VRow>
                    <VRow>
                      <VRowIcon><FindIcon /></VRowIcon>
                      <VRowLabel>Find on Page</VRowLabel>
                    </VRow>
                    <VRow $highlight>
                      <VRowIcon $highlight><PlusSquareIcon /></VRowIcon>
                      <VRowLabel $highlight>Add to Home Screen</VRowLabel>
                    </VRow>
                    <VRow>
                      <VRowIcon>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>
                      </VRowIcon>
                      <VRowLabel>Markup</VRowLabel>
                    </VRow>
                    <VRow>
                      <VRowIcon><PrintIcon /></VRowIcon>
                      <VRowLabel>Print</VRowLabel>
                    </VRow>
                  </VListScroll>
                </VList>
              </SceneD>

              {/* Single finger, moves across all four scenes via keyframes */}
              <Finger aria-hidden="true">👆</Finger>
            </DemoFrame>

            <InstructionCaption>
              <span>The app will then appear on your home screen.</span>
            </InstructionCaption>

            <InstructionClose onClick={() => setSheetOpen(false)}>
              Close
            </InstructionClose>
          </InstructionCard>
        </TopHalfOverlay>
      )}
    </>
  );
};

export default AddToHomeScreenBanner;
