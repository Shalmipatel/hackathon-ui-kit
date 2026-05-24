import React, { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import type { ExtensionSettings, CronNotification } from '@/types';
import { type SmartNotification, parseSmartNotifications, extractJsonBlock, looksLikeSmartNotification, parseSkillFrontmatter } from '@/types/notification';
import { getSystemSession, getPlatformEvents, getChatRepo } from '@/features/app/bootstrap/providers';
import { getDefaultConfig } from '@/features/app/config';
import { ChatBubble, ChatInput, ChatSidebar, type AppView } from '@/features/chat';
import { GENERAL_SESSION_ID } from '@/types/chat-session';
import { TypingIndicator, Toast, Spinner } from '@/components';
import type { ToastVariant } from '@/components/Toast';
import { useIsMobile } from '@/components/useIsMobile';
import { useEdgeSwipe } from '@/components/useEdgeSwipe';
import { SettingsView, SecurityView, ConnectionsView, useLocation } from '@/features/settings';
import { TripsView } from '@/features/travel';


/* Dev-only overlay. Wrapping the `lazy()` in `import.meta.env.DEV`
 * makes Rollup statically prove the chunk (and its transitive
 * `qrcode` dep) is unreachable in prod builds and strip it from
 * `dist/`. A bare `React.lazy(() => import(...))` would keep the
 * chunk on disk "just in case" — the dev-gate avoids that. */
const DevSettingsOverlay = import.meta.env.DEV
  ? lazy(() => import('@/dev/features/settings/DevSettingsOverlay'))
  : null;
import { NotificationsView, NotificationToast, SmartNotificationToast, NotificationBell } from '@/features/notifications';
import SessionFilesPanel, { type SessionFilesPanelHandle } from '@/features/files/SessionFilesPanel';
import PageHeader from '@/features/app/layouts/PageHeader';
import { useAuth, useOnboarding } from '@/features/auth';
import { usePushRegistration } from '@/features/auth/usePushRegistration';
import { useChat } from '@/features/chat';
import { useSettings } from '@/features/settings';
import { useNotificationStore, selectUnreadCount } from '@/features/notifications';
import {
  identifyAnalyticsUser,
  setUserPropertiesOnce,
  setCurrentSurface,
  EVENTS,
  track,
  type Surface,
} from '@/features/analytics';
import { useNavigationStore } from '@/features/navigation';
import { navigationBridge } from '@/providers/host-bridge';
import { theme } from '@/components/theme';

/* ── Layout ── */

/* Native wrapper bottom-nav reserves this much vertical space (icon +
   vertical padding). Safe-area-inset-bottom is added on top. Kept in
   sync with MobileBottomNav.tsx. */
const NATIVE_BOTTOM_NAV_HEIGHT = 52;

const PageShell = styled.div<{ $hasNativeBottomNav?: boolean }>`
  display: flex;
  /* Visible viewport height. Why the calc:
       - 100dvh alone is the right answer *if* WKWebView honours
         interactive-widget=resizes-content. Sometimes it does and
         dvh shrinks with the keyboard; sometimes it stays at full
         layout-viewport height, which would put our input pill
         below the keyboard and trigger WKWebView's auto-scroll
         (drags the chat header off-screen).
       - Subtracting --keyboard-inset (set from visualViewport in
         the sync effect below) makes the math work in either
         case: dvh shrinks → inset is 0 → no-op. dvh doesn't
         shrink → inset = keyboard height → we shrink manually.
       - This is more stable than mirroring vv.height directly
         (which drifts after multiple keyboard toggles in
         WKWebView), because we only depend on the *delta* between
         layout and visual viewport, not the absolute value. */
  height: 100vh;
  height: 100dvh;
  height: calc(100dvh - var(--keyboard-inset, 0px));
  position: relative;
  background: #242424;
  padding: 4px;
  gap: 8px;

  @media (max-width: 768px) {
    gap: 0;
    /* Pin to the layout viewport so WKWebView's outer scrollView can't
       slide PageShell up/down during the keyboard slide. Without this,
       even with body { overflow: hidden }, WKWebView still tries to
       scroll the focused input into view — you see the page jump up
       and then settle back down (the "twitch"). With position: fixed,
       PageShell stays put; only its height shrinks via the calc above,
       which is what we want. */
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    /* Smooth the keyboard slide. visualViewport.resize fires throughout
       the keyboard animation, so --keyboard-inset (and therefore the
       calc'd height) is already updating frame-by-frame — but on
       devices where it fires sparsely, or for the padding-bottom toggle
       driven by :has(input:focus) below, an explicit transition keeps
       the input pill's move and the chat's compression as one smooth
       motion instead of a step. iOS-flavoured easing curve + 220ms
       roughly matches the keyboard's own slide. */
    transition: height 220ms cubic-bezier(0.32, 0.72, 0, 1),
                padding-bottom 220ms cubic-bezier(0.32, 0.72, 0, 1);
    will-change: height, padding-bottom;
    /* Pad by the iOS safe-area insets so page content doesn't sit under the
       status bar or home indicator. Background still flows into those
       regions so there's no hard "bar" boundary. When the native bottom
       nav is mounted, reserve its height too so the last item in any
       scrollable view stays visible. */
    /* Bottom inset = whichever is bigger: the keyboard (when open), or
       the safe-area home indicator + native bottom nav (when keyboard
       is down). Using max() avoids double-counting — when the keyboard
       is up, both the nav and the home indicator are behind it anyway.
       No CSS transition: visualViewport.resize fires on the same frame
       as the keyboard slides, so the layout tracks naturally. A
       transition here would queue *after* the keyboard finishes
       animating and looks like a delayed catch-up. */
    padding:
      env(safe-area-inset-top, 0)
      env(safe-area-inset-right, 0)
      max(
        calc(env(safe-area-inset-bottom, 0) + ${(p) => (p.$hasNativeBottomNav ? `${NATIVE_BOTTOM_NAV_HEIGHT}px` : '0px')}),
        var(--keyboard-inset, 0px)
      )
      env(safe-area-inset-left, 0);

    /* Keyboard actually visible (visualViewport-driven body.keyboard-up
       class set in the sync effect below). Drop the bottom-nav padding
       reservation in lockstep with MobileBottomNav hiding itself —
       otherwise the chat input pill briefly slides down under the still-
       visible nav while focus has fired but the keyboard hasn't. */
    body.keyboard-up & {
      padding-bottom: 0;
    }

    /* Chat-view input gap: 24px below the pill when the bottom nav is
       on screen (gives breathing room above the nav), tightened to 4px
       when the keyboard is up so the pill sits flush above the keyboard
       suggestion bar. Consumed by ViewContainer's inline padding-bottom
       on the chat branch. */
    --chat-input-bottom-pad: 24px;
    body.keyboard-up & {
      --chat-input-bottom-pad: 12px;
    }
    background: #fbfaf9;
  }
`;

const MainArea = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  position: relative;
`;

/* Safe-area top mask: solid page bg over the iOS status-bar zone,
   then a soft fade into the content below. Matches the Figma pattern
   where the status-bar background bleeds gently into the page rather
   than ending at a hard edge. */
const TopFade = styled.div`
  display: none;

  @media (max-width: 768px) {
    display: block;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: calc(env(safe-area-inset-top, 0) + 24px);
    z-index: 50;
    pointer-events: none;
    background: linear-gradient(
      to bottom,
      #fbfaf9 0%,
      #fbfaf9 env(safe-area-inset-top, 0),
      rgba(251, 250, 249, 0) 100%
    );
  }
`;

const MainInner = styled.div`
  flex: 1;
  background: #fbfaf9;
  border: 1px solid rgba(36, 36, 36, 0.75);
  border-radius: 24px;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  @media (max-width: 768px) {
    border: none;
    border-radius: 0;
    /* Inherit the body bg so the page flows continuously from under the
       iOS status bar through to the bottom — no visible "bar" boundary. */
    background: transparent;
  }
`;

const MobileMenuButton = styled.button`
  display: none;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;

  @media (max-width: 768px) {
    display: flex;
  }
`;

const MobileBackdrop = styled.div<{ $open: boolean }>`
  display: none;

  @media (max-width: 768px) {
    display: ${(p) => (p.$open ? 'block' : 'none')};
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 199;
    transition: opacity 0.3s ease;
  }
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 52px;
  background: transparent;
  flex-shrink: 0;
  z-index: 101;

  @media (max-width: 768px) {
    padding: 0 16px;
    height: 48px;
  }
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const SidebarToggle = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: ${theme.colors.textSecondary};
  font-size: 16px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: ${theme.colors.assistantBubble};
    color: ${theme.colors.textPrimary};
  }

  @media (max-width: 768px) { width: 44px; height: 44px; }
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const IpBadge = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid ${theme.colors.border};
  border-radius: 6px;
  background: transparent;
  color: ${theme.colors.textSecondary};
  font-size: 11px;
  font-family: ${theme.fontFamily};
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;

  &:hover {
    background: ${theme.colors.assistantBubble};
    border-color: ${theme.colors.textMuted};
  }
`;

/*
 * Mobile-only "New chat" FAB. The bottom-right corner gives users a
 * one-tap way to start a fresh chat from anywhere in the app.
 *
 * Hidden entirely on desktop (sidebar always has "New chat" next to the
 * Chat row) and hidden on the Chat + Calendar views where page-level
 * affordances already own the corner: Chat has the composer's new-task
 * behavior, Calendar has CreateEventFab for creating events.
 */
const NewChatFab = styled.button`
  position: fixed;
  right: 16px;
  bottom: calc(16px + env(safe-area-inset-bottom, 0));
  /*
   * z-index 50 — above page content but below the A2HS banner (9998) and
   * the BottomSheet backdrop (10000), so the banner cleanly covers this
   * FAB when it's up, and any open sheet does too.
   */
  z-index: 50;
  width: 56px;
  height: 56px;
  border: none;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #242424;
  color: #fbfaf9;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(36, 36, 36, 0.3);
  transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 10px 28px rgba(36, 36, 36, 0.36);
    background: #111111;
  }
  &:active { transform: scale(0.96); }
  &:focus-visible {
    outline: 2px solid #feeb29;
    outline-offset: 2px;
  }

  /* Desktop hides the FAB entirely — sidebar's inline "new chat" suffices. */
  @media (min-width: 769px) {
    display: none;
  }
`;

const SessionTitleText = styled.span`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
  color: ${theme.colors.textPrimary};
`;

const SessionHashPrefix = styled.span`
  color: ${theme.colors.textMuted};
  font-weight: 400;
`;

const CompleteButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border: 1px solid #22c55e;
  border-radius: 8px;
  background: transparent;
  color: #22c55e;
  font-size: 12px;
  font-weight: 500;
  font-family: ${theme.fontFamily};
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;

  &:hover {
    background: #22c55e12;
  }

  svg {
    flex-shrink: 0;
  }
`;

const CompletedBadge = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: #22c55e12;
  color: #22c55e;
  font-size: 12px;
  font-weight: 500;
  font-family: ${theme.fontFamily};
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: #22c55e;
    background: transparent;
  }
`;


const ChatArea = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: #fbfaf9;
  border-left: 1px solid #f9fafb;
  border-radius: 24px;
  position: relative;

  @media (max-width: 768px) {
    border-radius: 0;
    border-left: none;
  }
`;

/* Hides its child on mobile breakpoints. Used to suppress the generic
   PageHeader inside the chat view, since the new compact ChatTopBar
   provides title + sidebar-toggle + files in one row. */
const DesktopOnly = styled.div`
  @media (max-width: 768px) {
    display: none;
  }
`;

const ViewPage = styled.div`
  flex: 1;
  overflow-y: auto;
  background: #fbfaf9;
  scrollbar-gutter: stable;

  &::-webkit-scrollbar {
    width: 8px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(36, 36, 36, 0.25);
    border-radius: 4px;
  }
  &::-webkit-scrollbar-thumb:hover {
    background: rgba(36, 36, 36, 0.4);
  }
`;

const ViewContainer = styled.div`
  padding: 32px 48px 72px;
  display: flex;
  flex-direction: column;
  gap: 32px;
  /* Mobile: 8px top padding so the first card doesn't visually butt
     against the page header's fade tail — content sits just below it
     on first paint, then scrolls under cleanly when the user pans. */
  @media (max-width: 768px) { padding: 8px 16px 32px; gap: 16px; }
`;

const overlayFadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const overlayFadeOut = keyframes`
  from { opacity: 1; }
  to { opacity: 0; }
`;

const DropOverlay = styled.div<{ $closing?: boolean }>`
  position: fixed;
  inset: 0;
  background: rgba(36, 36, 36, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: ${(p) => p.$closing ? overlayFadeOut : overlayFadeIn} 0.25s ease-out forwards;
`;

const DropOverlayContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 25px;
  color: #fbfaf9;
  font-family: 'Inter', sans-serif;
  font-size: 24px;
  font-weight: 500;
  letter-spacing: -0.3px;
  line-height: 32px;
  text-align: center;
`;

const DropOverlayIcons = styled.div`
  display: flex;
  align-items: center;
`;

const ChatTitleBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 16px 0;
  flex-shrink: 0;
  position: relative;
  max-width: 722px;
  width: 100%;
  margin: 0 auto;

  @media (max-width: 768px) {
    padding: 8px 16px;
    max-width: 100%;
  }
`;

const ChatTitleText = styled.span`
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 15px;
  color: #242424;
  letter-spacing: -0.3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const chatMenuIn = keyframes`
  from { opacity: 0; transform: translateY(-4px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
`;

const chatMenuOut = keyframes`
  from { opacity: 1; transform: translateY(0) scale(1); }
  to   { opacity: 0; transform: translateY(-4px) scale(0.97); }
`;

const ChatTitleMenu = styled.div<{ $closing?: boolean }>`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 99999;
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  min-width: 200px;
  padding: 8px;
  transform-origin: top left;
  animation: ${(p) => (p.$closing ? chatMenuOut : chatMenuIn)} 150ms cubic-bezier(0.4, 0, 0.2, 1) both;
`;

const ChatTitleMenuItem = styled.button<{ $danger?: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 14px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: ${(p) => (p.$danger ? '#ef4444' : 'white')};
  font-size: 15px;
  font-weight: 500;
  font-family: 'Inter', sans-serif;
  letter-spacing: -0.3px;
  cursor: pointer;
  transition: background 0.1s;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
  }
`;

const PageTitleBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 0;
  flex-shrink: 0;
  max-width: 722px;
  width: 100%;
  margin: 0 auto;

  @media (max-width: 768px) {
    padding: 12px 16px;
    max-width: 100%;
  }
`;

const PageTitleIcon = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: #242424;
`;

const PageTitleText = styled.span`
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 15px;
  color: #242424;
  letter-spacing: -0.3px;
`;

const ChatTitleOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 99998;
`;

const ScrollArea = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  /* Make this a flex column so children can use margin-top: auto to
     anchor to the bottom of the visible scroll region. Falling back
     to the previous min-height: 100% trick on the inner list was
     unreliable inside a non-flex parent — the percentage didn't always
     resolve in WKWebView, so messages stacked at the top with empty
     space below. */
  display: flex;
  flex-direction: column;

  /* Extend the scroll area (and therefore its native scrollbar) past
     the ViewContainer's 16px right padding so the scrollbar sits flush
     to the screen edge. The MessageList's matching right padding keeps
     message bubbles in their original 16px gutter. */
  @media (max-width: 768px) {
    margin-right: -16px;
  }

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(36, 36, 36, 0.15);
    border-radius: 3px;
  }
  &::-webkit-scrollbar-thumb:hover {
    background: rgba(36, 36, 36, 0.3);
  }
  scrollbar-width: thin;
  scrollbar-color: rgba(36, 36, 36, 0.15) transparent;
`;

const ScrollContent = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100%;
  width: 100%;
`;

const MessageList = styled.div`
  padding: 16px 0 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  /* Anchor messages to the bottom of the (flex column) ScrollArea.
     margin-top: auto pushes this list down so a short conversation
     hugs the input pill — matching the design — while still letting
     the list grow naturally and scroll once content overflows. */
  margin-top: auto;

  /* ScrollArea extends 16px past ViewContainer on mobile to put the
     scrollbar flush against the screen edge — re-add that 16px here
     so message bubbles keep their original right gutter. */
  @media (max-width: 768px) {
    padding-right: 16px;
  }
`;

const InputFooter = styled.div`
  flex-shrink: 0;
  max-width: 722px;
  margin: 0 auto;
  width: 100%;
  padding: 8px 16px 24px;

  @media (max-width: 768px) {
    padding: 8px 16px 16px;
    max-width: 100%;
  }
`;

const SessionLoadingState = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: ${theme.colors.textSecondary};

  span {
    font-size: 13px;
    font-weight: 500;
  }
`;

/* ── Chat two-column layout ── */

const ChatGrid = styled.div`
  display: flex;
  gap: 24px;
  flex: 1;
  min-height: 0;
  width: 100%;
`;

const ChatCard = styled.div`
  background: white;
  border: 1px solid rgba(36, 36, 36, 0.05);
  border-radius: 24px;
  width: 656px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 24px;
  gap: 24px;
  @media (max-width: 900px) { width: 100%; }
  /* Mobile: drop the card chrome entirely. Horizontal padding lives
     on the parent ViewContainer (16px), so the card contributes
     none — that's how we get a true 16px page gutter instead of 32. */
  @media (max-width: 768px) {
    background: transparent;
    border: none;
    border-radius: 0;
    padding: 0;
    gap: 12px;
    overflow: visible;
  }
`;

const ChatTopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  gap: 8px;
  min-width: 0;

  /* Mobile/native: extend full-width with a soft fade tail beneath
     the bar — same pattern as PageHeader/HomeView so all page-title
     headers behave consistently. The chat header is already static
     (it's a flex sibling of the scrolling messages area, not inside
     the scroll), so it doesn't need position: sticky.

     The ::after extends past the 16px ChatCard gap and reaches ~16px
     into the top of ScrollArea so chat messages scrolling up actually
     pass under a visible gradient — without this overlap the fade
     just sits in an empty gap zone and isn't visible. z-index 60 on
     the bar plus the auto z-index on ::after keeps the fade painted
     above the messages it's washing out. */
  @media (max-width: 768px) {
    position: relative;
    margin: 0 -16px;
    padding: 6px 16px;
    background: #fbfaf9;
    z-index: 60;

    &::after {
      content: '';
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      height: 32px;
      pointer-events: none;
      background: linear-gradient(
        to bottom,
        #fbfaf9 0%,
        #fbfaf9 16px,
        rgba(251, 250, 249, 0) 100%
      );
    }
  }
`;

/* Sidebar-toggle button shown only on mobile inside the chat header.
   On desktop the persistent sidebar makes this redundant. */
const MobileChatMenuBtn = styled.button`
  display: none;
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  color: #242424;
  -webkit-tap-highlight-color: transparent;

  @media (max-width: 768px) {
    display: flex;
  }
`;

/* New-chat icon button shown in the chat header right on the native
   wrapper, replacing the inline files badge. The Files entry moved
   into the chat-title dropdown. Same chat-bubble-with-plus glyph used
   by the bottom nav so the affordance reads consistently. The :active
   shrink mirrors MobileBottomNav's TabBtn for matching tactile feel. */
const HeaderNewChatBtn = styled.button`
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  color: #242424;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  -webkit-user-select: none;
  transition: transform 0.12s ease;

  &:active {
    transform: scale(0.85);
  }
`;

const ChatTopBarLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  position: relative;
  /* Without these, the label's min-content (= widest single word) sets the
     column width and the prev-chat pill on the right ends up squeezing the
     title into one-word-per-line wrapping on mobile. */
  flex: 1 1 auto;
  min-width: 0;
`;

const ChatTopBarRight = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding-right: 8px;
  border-radius: 8px;
  cursor: pointer;
  flex-shrink: 0;
  min-width: 0;
`;

const ChatTopBarLabel = styled.span`
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 15px;
  color: #242424;
  letter-spacing: -0.3px;
  line-height: 24px;
  /* Single-line truncation instead of word-wrap — keeps the bar at a
     consistent height when the session title is long. */
  display: block;
  min-width: 0;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ChatTopBarCount = styled.span`
  font-family: 'Red Hat Display', sans-serif;
  font-weight: 500;
  font-size: 14px;
  color: rgba(36, 36, 36, 0.75);
  line-height: 21px;
`;

const RecentChatsCard = styled.div`
  background: white;
  border: 1px solid rgba(36, 36, 36, 0.05);
  border-radius: 24px;
  flex: 1;
  min-width: 0;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  overflow-y: auto;

  @media (max-width: 900px) { display: none; }
`;

const RecentChatsTitle = styled.div`
  font-family: 'Inter', sans-serif;
  font-weight: 700;
  font-size: 13px;
  color: rgba(36, 36, 36, 0.75);
  letter-spacing: -0.3px;
  line-height: 20px;
`;

const RecentChatsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const RecentChatItem = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 4px;
  height: 58px;
  padding: 8px 8px 8px 12px;
  border: none;
  border-radius: 4px;
  background: ${p => p.$active ? 'rgba(36, 36, 36, 0.05)' : 'transparent'};
  cursor: pointer;
  text-align: left;
  position: relative;
  width: 100%;
  transition: background 0.15s;

  &:hover { background: rgba(36, 36, 36, 0.05); }

  ${p => p.$active && `
    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 4px;
      background: #feeb29;
      border-radius: 0 4px 4px 0;
    }
  `}
`;

const RecentChatInfo = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const RecentChatName = styled.p`
  font-family: 'Red Hat Display', sans-serif;
  font-weight: 500;
  font-size: 14px;
  color: #242424;
  line-height: 21px;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const RecentChatDate = styled.span`
  font-family: 'Red Hat Display', sans-serif;
  font-weight: 500;
  font-size: 12px;
  color: rgba(36, 36, 36, 0.8);
  line-height: 18px;
`;

const RecentChatMoreBtn = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  color: rgba(36, 36, 36, 0.35);
  border-radius: 8px;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;

  &:hover { color: #242424; background: rgba(36, 36, 36, 0.05); }

  ${RecentChatItem}:hover &,
  ${RecentChatItem}[data-active='true'] & {
    opacity: 1;
  }
`;

/**
 * Multi-step recovery: try to extract valid SmartNotification JSON from a raw
 * response that failed direct parsing.
 *  1. Look for a ```json fenced code block and parse it.
 *  2. If the text contains SmartNotification keywords, ask the LLM to reformat.
 *  3. Returns null when recovery is not possible so caller can fall back.
 */
async function attemptSmartRecovery(raw: string): Promise<SmartNotification[] | null> {
  try {
    const jsonBlock = extractJsonBlock(raw);
    if (jsonBlock) {
      const fromBlock = parseSmartNotifications(jsonBlock);
      if (fromBlock !== null) return fromBlock;
    }

    if (!looksLikeSmartNotification(raw)) return null;

    const reformatted = await getSystemSession().execute({
      type: 'reformat_notification',
      rawResponse: raw,
    });

    if (reformatted) {
      return parseSmartNotifications(reformatted);
    }
  } catch (err) {
    console.warn('[TabPage] Smart notification recovery failed:', err);
  }
  return null;
}

/* ── Component ── */

export const TabPage: React.FC = () => {
  const { authState, loading: authLoading, strategy: authStrategy, checkAuth, signOut } = useAuth();
  usePushRegistration(authState.isLoggedIn);
  const {
    messages,
    sessions,
    currentSessionId,
    isGeneralSession,
    isSessionLoading,
    isSyncing,
    isStreaming,
    streamingMessageId,
    activeTool,
    sendMessage,
    abortStream,
    regenerate,
    newTask,
    clearGeneralSession,
    switchSession,
    deleteSession,
    pinSession,
    unpinSession,
    refreshSessions,
    markComplete,
    updateTaskStatus,
  } = useChat(authState.isLoggedIn);
  const { settings, updateSettings } = useSettings();

  /* Mirror the iOS keyboard height into a CSS variable so layouts can
   * lift their bottom edge above the on-screen keyboard. visualViewport
   * shrinks when the keyboard appears; layout viewport (window.innerHeight)
   * stays the same — the difference is the keyboard's visible height.
   * Used by PageShell's bottom padding on mobile.
   *
   * Implementation notes for WKWebView jank:
   *
   * 1. visualViewport.resize fires in bursts (2–4 events, then a 30–50ms
   *    gap) on iOS WKWebView, not smoothly at 60fps. We rAF-coalesce so
   *    multiple resize fires within one frame collapse into one DOM
   *    write — otherwise we'd thrash the style engine and the CSS
   *    transition on PageShell.height would keep re-targeting mid-flight.
   *
   * 2. scrollIntoView is only called on the up→down or down→up keyboard
   *    transition, not on every intermediate inset value. Calling it
   *    per-frame during the dismiss caused the "messages jumping around"
   *    symptom: PageShell.height is mid-animation, so the scroll target
   *    keeps moving, and each pin re-pins to a slightly different
   *    position. On dismiss, we don't auto-scroll at all — the user's
   *    view already shows the latest message above the descending
   *    keyboard, so there's nothing to do.
   *
   * 3. body.keyboard-up flips at most twice per keyboard cycle (once on
   *    show, once on hide), not per resize fire. Class toggles
   *    invalidate style for every descendant they could match — keeping
   *    the toggle count low keeps style recalc out of the slide path.
   */
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    let prevInset = 0;
    let prevUp = false;
    let rafId = 0;

    const apply = () => {
      rafId = 0;
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      if (inset === prevInset) return;
      document.documentElement.style.setProperty('--keyboard-inset', `${inset}px`);
      prevInset = inset;

      const up = inset > 0;
      if (up !== prevUp) {
        document.body.classList.toggle('keyboard-up', up);
        prevUp = up;
        /* Pin to the latest message only when the keyboard appears.
           On dismiss, the keyboard descending already reveals the
           message above it, so an auto-scroll there would just fight
           the in-flight CSS height transition (= "scroll jump"
           symptom). */
        if (up && !userScrolledUpRef.current) {
          bottomAnchorRef.current?.scrollIntoView({ block: 'end', behavior: 'instant' });
        }
      }
    };

    const schedule = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(apply);
    };

    vv.addEventListener('resize', schedule);
    vv.addEventListener('scroll', schedule);
    apply();

    return () => {
      vv.removeEventListener('resize', schedule);
      vv.removeEventListener('scroll', schedule);
      if (rafId) cancelAnimationFrame(rafId);
      document.documentElement.style.removeProperty('--keyboard-inset');
      document.body.classList.remove('keyboard-up');
    };
  }, []);
  
  /*
   * Mirror the auth identity into the analytics layer so autocaptured
   * events and semantic `trackEvent` calls are attributed to the real
   * user instead of an anonymous distinct_id. `identifyAnalyticsUser` is
   * expected to be idempotent and to handle user-switching on the same
   * browser via a reset.
   *
   * Also fires the auth-lifecycle events from analytics tracking plan §3 Group 1:
   *
   *   - `Auth Completed` when isLoggedIn transitions false → true within
   *     this mount (the user just finished an OAuth popup flow).
   *   - `Session Started` when isLoggedIn is already true on the very
   *     first identify-effect run (the user landed on the app with a
   *     pre-existing valid session — e.g. cookie still alive from a
   *     previous tab).
   *
   * `is_new_user` is derived from a per-sub localStorage marker — first
   * time we ever see a sub on this device, treat it as new. Imperfect
   * across devices/browsers, but cleanly client-derivable without
   * requiring server-side support. People property `signup_date` is
   * set_once so the first-seen timestamp survives subsequent identifies.
   */
  const previousIsLoggedInRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!authState.isLoggedIn) {
      previousIsLoggedInRef.current = false;
      return;
    }
    identifyAnalyticsUser({
      id: authState.sub,
      email: authState.email,
      name: authState.displayName,
    });

    const seenKey = `neoclaw_seen_user_${authState.sub}`;
    let isNewUser = false;
    try {
      isNewUser = !localStorage.getItem(seenKey);
      if (isNewUser) localStorage.setItem(seenKey, String(Date.now()));
    } catch {
      /* localStorage may be disabled — best-effort, treat as not new */
    }

    setUserPropertiesOnce({ signup_date: new Date().toISOString() });

    const wasLoggedIn = previousIsLoggedInRef.current;
    previousIsLoggedInRef.current = true;

    if (wasLoggedIn === false) {
      /* Transition: user just completed an OAuth flow this mount. */
      track(EVENTS.AUTH_COMPLETED, {
        auth_provider: 'oauth_cookie',
        is_new_user: isNewUser,
      });
    } else if (wasLoggedIn === null) {
      /* Initial mount with valid session already present. */
      track(EVENTS.SESSION_STARTED, {
        is_returning_user: !isNewUser,
      });
    }
  }, [authState.isLoggedIn, authState.sub, authState.email, authState.displayName]);

  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const chatTouchStartYRef = useRef<number | null>(null);
  const filesPanelRef = useRef<SessionFilesPanelHandle>(null);
  /* Tracks whether the bottom-nav chat tab has been tapped at least
     once this app session. Resets to false on every page load — which,
     in the native WebView, happens on each app cold-launch. The first
     tap after launch sends users to #general; subsequent taps jump to
     the most recent real chat. */
  const chatTabVisitedThisLaunchRef = useRef(false);
  // Default collapsed on narrower desktop viewports so the main content
  // isn't squeezed into a cramped middle state (sidebar + 2-col grid don't
  // coexist gracefully below ~1100px). Mobile (<=768px) uses a separate
  // drawer that renders expanded, so it must start uncollapsed — otherwise
  // the drawer slides in with labels/sections hidden.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.innerWidth > 768 &&
      window.innerWidth < 1100,
  );
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Auto-collapse when the viewport drops below the threshold; auto-expand
  // when it grows above. Only active on desktop (>768px) since mobile uses
  // a separate drawer flow.
  useEffect(() => {
    const handler = () => {
      if (window.innerWidth > 768) {
        setSidebarCollapsed(window.innerWidth < 1100);
      } else {
        setSidebarCollapsed(false);
      }
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  const [settingsOverlayOpen, setSettingsOverlayOpen] = useState(false);
  const [activeView, setActiveView] = useState<AppView>('trips');

  /*
   * Dev-only event hook for re-opening the Dev Settings overlay from
   * other surfaces that don't render a visible toggle. Production
   * builds tree-shake the overlay itself, so the listener is harmless
   * there but only ever does anything in dev.
   */
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const handler = () => setSettingsOverlayOpen(true);
    window.addEventListener('app:open-dev-settings', handler);
    return () =>
      window.removeEventListener('app:open-dev-settings', handler);
  }, []);

  /*
   * `Surface Viewed` (analytics tracking plan §3 Group 9) + `surface`
   * super-property update on every tab change. The super-property is
   * also stamped on every other event from this tab change onwards, so
   * "where did the user trigger X from?" is answerable for every event
   * in Groups 1–11 without per-emit-site plumbing.
   *
   * `previousSurfaceRef` retains the prior surface across renders;
   * `surfaceEnteredAtRef` measures dwell time on the previous surface.
   * On the very first run there's no "previous surface" — we still fire
   * Surface Viewed (so initial-tab attribution exists) but omit the
   * dwell-time fields.
   */
  const previousSurfaceRef = useRef<Surface | null>(null);
  const surfaceEnteredAtRef = useRef<number>(Date.now());
  useEffect(() => {
    /* AppView lacks 'notifications' in its declared union but it's a
     * real value used at the call sites — `Surface` is a superset, so
     * the cast is safe. */
    const current = activeView as Surface;
    const previous = previousSurfaceRef.current;
    const now = Date.now();
    track(EVENTS.SURFACE_VIEWED, {
      surface: current,
      ...(previous
        ? {
            previous_surface: previous,
            time_on_previous_surface_ms: now - surfaceEnteredAtRef.current,
          }
        : {}),
    });

    if (current === 'chat') {
      track(EVENTS.CHAT_OPENED, {
        unread_count_on_open: useNotificationStore.getState().unreadCount,
      });
    } else if (current === 'settings' || current === 'connections') {
      track(EVENTS.SETTINGS_OPENED, { surface_from: previous ?? undefined });
    } else if (current === 'notifications') {
      track(EVENTS.NOTIFICATION_OPENED, {
        notification_type: 'list',
        notification_id: 'surface',
        delivery_channel: 'in_app',
      });
    }

    setCurrentSurface(current);
    previousSurfaceRef.current = current;
    surfaceEnteredAtRef.current = now;
  }, [activeView]);

  // Edge-swipe gesture: on mobile, sliding right from the left edge of the
  // viewport opens the navigation drawer, like a native iOS app.
  // Disabled when the drawer is already open or any modal/overlay is up
  // so we don't fight other gestures.
  const isMobile = useIsMobile();

  /* Tabs that share the ChatArea > PageHeader + ViewPage > ViewContainer
     shape (Security/Connections/Settings) reconcile to the same ViewPage
     DOM, so scroll position survives navigation. Reset it to top whenever
     activeView changes. Chat has a different shape, so its scroll
     container naturally remounts. */
  const tabScrollRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (tabScrollRef.current) tabScrollRef.current.scrollTop = 0;
  }, [activeView]);

  useEdgeSwipe({
    enabled: isMobile && !mobileSidebarOpen && !settingsOverlayOpen,
    edgeSize: 24,
    threshold: 60,
    onOpen: () => setMobileSidebarOpen(true),
  });

  const handleLogout = useCallback(async () => {
    await signOut();
    setActiveView('chat');
    setMobileSidebarOpen(false);
  }, [signOut]);

  const unreadNotificationCount = useNotificationStore(selectUnreadCount);

  const { showOnboarding, completeOnboarding } = useOnboarding();
  useLocation(authState.isLoggedIn && showOnboarding === false);

  // Deep-link navigation from host-bridge (iOS notification taps).
  useEffect(() => navigationBridge.listen(), []);

  // Consume pending navigation intents from the navigation store.
  const pendingNav = useNavigationStore((s) => s.pending);
  useEffect(() => {
    if (!pendingNav) return;
    const nav = useNavigationStore.getState().consume();
    if (!nav) return;

    switch (nav.type) {
      case 'home':
        setActiveView('chat');
        break;
      case 'chat':
        switchSession(nav.sessionId);
        setActiveView('chat');
        break;
    }
  }, [pendingNav, switchSession]);

  const [toast, setToast] = useState<string | null>(null);
  const [toastFading, setToastFading] = useState(false);
  const [toastVariant, setToastVariant] = useState<ToastVariant>('error');
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, variant: ToastVariant = 'error') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastFading(false);
    setToastVariant(variant);
    setToast(message);
    toastTimerRef.current = setTimeout(() => {
      setToastFading(true);
      toastTimerRef.current = setTimeout(() => {
        setToast(null);
        setToastFading(false);
      }, 250);
    }, 4000);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastFading(true);
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      setToastFading(false);
    }, 250);
  }, []);

  // Notification toast state
  const [notificationToast, setNotificationToast] = useState<CronNotification | null>(null);
  const [notificationToastFading, setNotificationToastFading] = useState(false);
  const notificationToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotificationToast = useCallback((notification: CronNotification) => {
    if (notificationToastTimerRef.current) clearTimeout(notificationToastTimerRef.current);
    setNotificationToastFading(false);
    setNotificationToast(notification);
    notificationToastTimerRef.current = setTimeout(() => {
      setNotificationToastFading(true);
      notificationToastTimerRef.current = setTimeout(() => {
        setNotificationToast(null);
        setNotificationToastFading(false);
      }, 300);
    }, 5000);
  }, []);

  const dismissNotificationToast = useCallback(() => {
    if (notificationToastTimerRef.current) clearTimeout(notificationToastTimerRef.current);
    setNotificationToastFading(true);
    notificationToastTimerRef.current = setTimeout(() => {
      setNotificationToast(null);
      setNotificationToastFading(false);
    }, 300);
  }, []);

  const handleNotificationToastClick = useCallback(async () => {
    const notification = notificationToast;
    dismissNotificationToast();
    if (!notification) return;
    useNotificationStore.getState().markAsRead(notification.id);
    setActiveView('chat');
  }, [dismissNotificationToast, notificationToast]);

  // Smart notification toast state (array, no auto-dismiss)
  const [smartToasts, setSmartToasts] = useState<SmartNotification[]>([]);
  const [chatAreaDragOver, setChatAreaDragOver] = useState(false);
  const [overlayClosing, setOverlayClosing] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[] | undefined>(undefined);
  const dropCooldownRef = useRef(false);

  const dismissSmartToast = useCallback((index: number) => {
    setSmartToasts((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSmartExecute = useCallback(
    async (index: number, prompt: string) => {
      dismissSmartToast(index);
      await newTask();
      setActiveView('chat');
      setTimeout(() => {
        sendMessage(prompt);
      }, 100);
    },
    [dismissSmartToast, newTask, sendMessage],
  );

  // Listen for new cron notifications to show toast via PlatformEvents
  useEffect(() => {
    const { showCronNotifications } = getDefaultConfig().features;
    if (!showCronNotifications) return;

    const service = getPlatformEvents();
    const unsubscribe = service.subscribe({
      onCronRun: (cron) => {
        const raw = cron.fullResponse || cron.summary || '';
        const frontmatter = parseSkillFrontmatter(raw);
        if (frontmatter?.meta.skill) {
          showNotificationToast(cron);
          return;
        }

        const smartList =
          parseSmartNotifications(cron.summary) ??
          (cron.fullResponse ? parseSmartNotifications(cron.fullResponse) : null);
        if (smartList !== null) {
          if (smartList.length > 0) {
            setSmartToasts((prev) => [...prev, ...smartList]);
          }
        } else {
          attemptSmartRecovery(raw).then((recovered) => {
            if (recovered && recovered.length > 0) {
              setSmartToasts((prev) => [...prev, ...recovered]);
            } else {
              showNotificationToast(cron);
            }
          });
        }
      },
    });
    return unsubscribe;
  }, [showNotificationToast]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const visibleMessages = useMemo(
    () => {
      let firstUserSkipped = false;
      return messages.filter((m) => {
        if (m.isHidden) return false;
        if (/^\[cron:/.test(m.content)) return false;
        if (m.content === 'HEARTBEAT_OK') return false;
        if (isGeneralSession && m.role === 'user' && !firstUserSkipped) {
          firstUserSkipped = true;
          return false;
        }
        return true;
      });
    },
    [messages, isGeneralSession],
  );
  // Count total attachments - used to trigger file panel refresh only when attachments are sent
  const totalAttachmentCount = useMemo(
    () => messages.reduce((sum, msg) => sum + (msg.attachments?.length ?? 0), 0),
    [messages],
  );

  const showTypingIndicator =
    isStreaming &&
    messages.length > 0 &&
    messages[messages.length - 1].role === 'user';

  const handleSettingsSave = useCallback(
    (updates: Partial<ExtensionSettings>) => {
      updateSettings(updates);
    },
    [updateSettings],
  );

  const toggleSidebar = useCallback(() => {
    if (window.innerWidth <= 768) {
      setMobileSidebarOpen(false);
    } else {
      setSidebarCollapsed((prev) => !prev);
    }
  }, []);

  // toggleView removed — kanban view deprecated

  const handleSwitchSession = useCallback((sessionId: string) => {
    switchSession(sessionId);
    setActiveView('chat');
  }, [switchSession]);

  /* Bottom-nav chat tap (native only): replaces the yellow header
     "Chat" button. Behaviour:
       1. First tap after app launch → always #general. The user
          re-opening the app counts as a "new session" and we want a
          predictable landing point, not whatever was last open.
       2. Subsequent taps in the same launch:
          - Already in a non-general chat → just surface the chat view.
          - Otherwise → most recently updated real session, or fall
            back to #general if there are none. Never auto-create a
            new task; the new-chat affordance lives in the chat header. */
  const handleGoToLatestChat = useCallback(() => {
    setMobileSidebarOpen(false);
    if (!chatTabVisitedThisLaunchRef.current) {
      chatTabVisitedThisLaunchRef.current = true;
      handleSwitchSession(GENERAL_SESSION_ID);
      return;
    }
    if (currentSessionId && !isGeneralSession) {
      setActiveView('chat');
      return;
    }
    const realSessions = sessions.filter((s) => !s.isGeneral);
    if (realSessions.length === 0) {
      handleSwitchSession(GENERAL_SESSION_ID);
      return;
    }
    const latest = [...realSessions].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    handleSwitchSession(latest.id);
  }, [currentSessionId, isGeneralSession, sessions, handleSwitchSession]);

  const handleNotificationsClick = useCallback(() => {
    setActiveView('notifications');
  }, []);

  const handleNotificationBack = useCallback(() => {
    setActiveView('chat');
  }, []);

  // Drag and drop handlers for chat area
  const handleChatAreaDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Ignore residual dragover events right after a drop
    if (dropCooldownRef.current) return;
    if (e.dataTransfer.types.includes('Files')) {
      setChatAreaDragOver(true);
    }
  }, []);

  const handleChatAreaDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropCooldownRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const { clientX, clientY } = e;
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      // Fade out overlay
      setOverlayClosing(true);
      setTimeout(() => { setChatAreaDragOver(false); setOverlayClosing(false); }, 250);
    }
  }, []);

  const handleChatAreaDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Block dragover from re-showing overlay for 500ms after drop
    dropCooldownRef.current = true;
    setTimeout(() => { dropCooldownRef.current = false; }, 500);

    // Fade out overlay
    setOverlayClosing(true);
    setTimeout(() => { setChatAreaDragOver(false); setOverlayClosing(false); }, 250);

    const files: File[] = [];
    if (e.dataTransfer.files) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        files.push(e.dataTransfer.files[i]);
      }
    }
    if (files.length > 0) {
      setDroppedFiles(files);
    }
  }, []);

  const handleExternalFilesProcessed = useCallback(() => {
    setDroppedFiles(undefined);
  }, []);

  const handleNotificationClick = useCallback(async (notification: CronNotification) => {
    useNotificationStore.getState().markAsRead(notification.id);
    setActiveView('chat');
  }, []);

  // Get current session info for the header
  const currentSession = sessions.find((s) => s.id === currentSessionId);
  const currentSessionTitle = (() => {
    if (isGeneralSession) return '#general';
    return currentSession?.title ?? '';
  })();
  const currentSessionStatus = currentSession?.status;
  const [chatTitleMenuOpen, setChatTitleMenuOpen] = useState(false);
  const [chatTitleMenuClosing, setChatTitleMenuClosing] = useState(false);
  const chatTitleMenuCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeChatTitleMenu = useCallback(() => {
    if (chatTitleMenuCloseTimerRef.current) clearTimeout(chatTitleMenuCloseTimerRef.current);
    setChatTitleMenuClosing(true);
    chatTitleMenuCloseTimerRef.current = setTimeout(() => {
      setChatTitleMenuOpen(false);
      setChatTitleMenuClosing(false);
      chatTitleMenuCloseTimerRef.current = null;
    }, 150);
  }, []);
  const openChatTitleMenu = useCallback(() => {
    if (chatTitleMenuCloseTimerRef.current) {
      clearTimeout(chatTitleMenuCloseTimerRef.current);
      chatTitleMenuCloseTimerRef.current = null;
    }
    setChatTitleMenuClosing(false);
    setChatTitleMenuOpen(true);
  }, []);
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [titleEditValue, setTitleEditValue] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);
  // filesPanelOpen state removed — SessionFilesPanel handles its own toggle

  const handleChatTitleRename = useCallback(() => {
    closeChatTitleMenu();
    if (!currentSessionId) return;
    setTitleEditValue(currentSessionTitle);
    setIsTitleEditing(true);
  }, [closeChatTitleMenu, currentSessionId, currentSessionTitle]);

  const commitTitleRename = useCallback(() => {
    setIsTitleEditing(false);
    const trimmed = titleEditValue.trim();
    if (trimmed && trimmed !== currentSessionTitle && currentSessionId) {
      void getChatRepo()
        .updateTitle(currentSessionId, trimmed)
        .then(() => {
          refreshSessions();
        });
    }
  }, [titleEditValue, currentSessionId, currentSessionTitle, refreshSessions]);

  useEffect(() => {
    if (isTitleEditing && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isTitleEditing]);

  const handleChatTitlePin = useCallback(() => {
    closeChatTitleMenu();
    if (!currentSessionId) return;
    if (currentSession?.isPinned) {
      unpinSession(currentSessionId);
    } else {
      pinSession(currentSessionId);
    }
  }, [closeChatTitleMenu, currentSessionId, currentSession?.isPinned, pinSession, unpinSession]);

  const handleChatTitleDelete = useCallback(() => {
    closeChatTitleMenu();
    if (!currentSessionId) return;
    deleteSession(currentSessionId);
    setActiveView('chat');
  }, [closeChatTitleMenu, currentSessionId, deleteSession]);

  const handleScrollArea = useCallback(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    userScrolledUpRef.current = distFromBottom > 150;
  }, []);

  useEffect(() => {
    userScrolledUpRef.current = false;
  }, [currentSessionId]);

  useEffect(() => {
    if (!userScrolledUpRef.current) {
      bottomAnchorRef.current?.scrollIntoView({ block: 'end', behavior: 'instant' });
    }
  }, [messages, isStreaming]);

  const lastReceivedMessageIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (messages.length === 0) {
      lastReceivedMessageIdRef.current = null;
      return;
    }
    const last = messages[messages.length - 1];
    if (last.role !== 'assistant') return;
    if (last.id === streamingMessageId) return;
    if (lastReceivedMessageIdRef.current === last.id) return;
    lastReceivedMessageIdRef.current = last.id ?? null;
    track(EVENTS.CHAT_MESSAGE_RECEIVED, {
      message_type: last.audioDataUrl ? 'audio' : 'text',
    });
  }, [messages, streamingMessageId]);

  /* Keep the chat pinned to the latest message while the ScrollArea
     resizes (keyboard opening/closing, viewport changes, font reflow).
     Just calling scrollIntoView when --keyboard-inset changes isn't
     enough — the CSS height transition on PageShell keeps shrinking
     ScrollArea for ~220ms after, and scrollTop drifts off the bottom.
     A ResizeObserver fires for every clientHeight tick during the
     transition, so we re-pin on each frame.

     Skip when the user has scrolled up to read history (matches the
     same userScrolledUpRef gate used by the new-message auto-scroll). */
  useEffect(() => {
    const sa = scrollAreaRef.current;
    if (!sa) return;
    const ro = new ResizeObserver(() => {
      if (!userScrolledUpRef.current) {
        sa.scrollTop = sa.scrollHeight;
      }
    });
    ro.observe(sa);
    return () => ro.disconnect();
  }, [activeView, currentSessionId]);

  /*
   * Shared "new chat" handler — used by both the sidebar's inline new-chat
   * button AND the mobile NewChatFab so they behave identically. If the
   * user is currently inside a non-general session, we stash its id so the
   * sidebar can offer "return to previous chat" after the new task starts.
   */
  const handleNewChat = (): void => {
    newTask();
    setActiveView('chat');
    setMobileSidebarOpen(false);
  };

  /*
   * Suppress the New Chat FAB on views where a page-level affordance
   * already owns the bottom-right corner:
   *   - 'chat' has the composer + its own new-task behaviour
   *   - native wrapper folds new-chat into the bottom nav's chat tab
   */
  /* Mobile (web + native wrapper) folds new-chat into the bottom nav's
     chat tab, so the FAB is desktop-only. */
  const newChatFabVisible = activeView !== 'chat' && !isMobile;

  return (
    <>
      <PageShell
        $hasNativeBottomNav={isMobile}
        onDragOver={activeView === 'chat' ? handleChatAreaDragOver : undefined}
        onDragLeave={activeView === 'chat' ? handleChatAreaDragLeave : undefined}
        onDrop={activeView === 'chat' ? handleChatAreaDrop : undefined}
      >
        <TopFade aria-hidden />
        <ChatSidebar
          collapsed={sidebarCollapsed}
          mobileOpen={mobileSidebarOpen}
          sessions={sessions}
          currentSessionId={currentSessionId}
          isStreaming={isStreaming}
          activeView={activeView}
          userDisplayName={authState.displayName}
          userEmail={authState.email}
          userPicture={authState.picture}
          onToggleCollapse={toggleSidebar}
          onNewTask={handleNewChat}
          /*
           * iOS double-tap fix: the drawer's slide-out transform (kicked off
           * by setMobileSidebarOpen(false)) can race with the click event
           * delivery — Safari sometimes cancels the click when the target
           * starts moving off-screen mid-event, so the user's first tap
           * appears to do nothing and they have to tap again. Deferring the
           * drawer-close one tick (queueMicrotask) lets the click finish
           * against the still-stationary element before the transform runs.
           * setActiveView still fires synchronously so the destination view
           * is already mounted by the time the drawer slides away.
           */
          onNavigate={(view) => {
            setActiveView(view);
            queueMicrotask(() => setMobileSidebarOpen(false));
          }}
          onSwitchSession={(id) => {
            handleSwitchSession(id);
            setActiveView('chat');
            queueMicrotask(() => setMobileSidebarOpen(false));
          }}
          onDeleteSession={deleteSession}
          onPinSession={pinSession}
          onUnpinSession={unpinSession}
          onMarkComplete={markComplete}
          onUndoComplete={(id) => updateTaskStatus(id, 'needs_input')}
          onLogout={handleLogout}
        />
        <MobileBackdrop $open={mobileSidebarOpen} onClick={() => setMobileSidebarOpen(false)} />

        <MainArea>
          <MainInner>
          <Toast message={toast} fading={toastFading} onDismiss={dismissToast} variant={toastVariant} />
          <NotificationToast
            notification={notificationToast}
            fading={notificationToastFading}
            onClick={handleNotificationToastClick}
            onDismiss={dismissNotificationToast}
          />
          <SmartNotificationToast
            notifications={smartToasts}
            onExecute={handleSmartExecute}
            onDismiss={dismissSmartToast}
          />
          {/*
           * The Dev Settings overlay is reachable in dev by dispatching
           * `app:open-dev-settings` from devtools (handler wired ~80
           * lines up). Add a visible trigger here if you want one-click
           * access.
           */}
          {activeView === 'trips' ? (
            <ChatArea>
              <TripsView onNavigateToChat={() => setActiveView('chat')} />
            </ChatArea>
          ) : activeView === 'security' ? (
            <ChatArea>
              <PageHeader title="Security" onNavigate={(v) => setActiveView(v as AppView)} onNewChat={handleNewChat} onOpenMobileMenu={() => setMobileSidebarOpen(true)} />
              <ViewPage ref={tabScrollRef}>
                <ViewContainer>
                  <SecurityView />
                </ViewContainer>
              </ViewPage>
            </ChatArea>
          ) : activeView === 'connections' ? (
            <ChatArea>
              <PageHeader title="Connections" onNavigate={(v) => setActiveView(v as AppView)} onNewChat={handleNewChat} onOpenMobileMenu={() => setMobileSidebarOpen(true)} />
              <ViewPage ref={tabScrollRef}>
                <ViewContainer>
                  <ConnectionsView />
                </ViewContainer>
              </ViewPage>
            </ChatArea>
          ) : activeView === 'settings' ? (
            <ChatArea>
              <PageHeader title="Settings" onNavigate={(v) => setActiveView(v as AppView)} onNewChat={handleNewChat} onOpenMobileMenu={() => setMobileSidebarOpen(true)} />
              <ViewPage ref={tabScrollRef}>
                <ViewContainer>
                  <SettingsView />
                </ViewContainer>
              </ViewPage>
            </ChatArea>
          ) : (
            <ChatArea>
              <ViewPage style={{ overflow: 'hidden' }}>
                <ViewContainer style={{ alignItems: 'stretch', height: '100%', boxSizing: 'border-box', paddingBottom: 'var(--chat-input-bottom-pad, 24px)' }}>
                  <DesktopOnly>
                    <PageHeader title="AI Assistant" onNavigate={(v) => setActiveView(v as AppView)} onNewChat={handleNewChat} onOpenMobileMenu={() => setMobileSidebarOpen(true)} />
                  </DesktopOnly>
                  <ChatCard style={{ width: '100%', flex: 1, minHeight: 0 }}>
                    {/*
                     * Baseline starter UI is just the chat. Drop your own
                     * dashboard / infra panel above ChatTopBar if you
                     * want extra controls on this surface.
                     */}
                    <ChatTopBar>
                      <MobileChatMenuBtn
                        onClick={() => setMobileSidebarOpen(true)}
                        aria-label="Open menu"
                      >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                          <rect width="18" height="18" x="3" y="3" rx="2" />
                          <path d="M9 3v18" />
                        </svg>
                      </MobileChatMenuBtn>
                      <ChatTopBarLeft
                        /* preventDefault on mousedown stops the browser
                           from blurring the focused chat input — so on iOS
                           the soft keyboard stays up while the menu opens.
                           Click still fires normally afterwards. */
                        onMouseDown={(e) => { if (!isTitleEditing) e.preventDefault(); }}
                        onClick={() => {
                          if (isTitleEditing) return;
                          if (chatTitleMenuOpen && !chatTitleMenuClosing) {
                            closeChatTitleMenu();
                          } else {
                            openChatTitleMenu();
                          }
                        }}
                      >
                        {isTitleEditing ? (
                          <input
                            ref={titleInputRef}
                            value={titleEditValue}
                            onChange={(e) => setTitleEditValue(e.target.value)}
                            onBlur={commitTitleRename}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); commitTitleRename(); }
                              if (e.key === 'Escape') { e.preventDefault(); setIsTitleEditing(false); }
                            }}
                            style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500, fontSize: 15, color: '#242424', border: 'none', outline: 'none', background: 'transparent', padding: 0, width: '100%', maxWidth: 400, letterSpacing: '-0.3px' }}
                          />
                        ) : (
                          <>
                            <ChatTopBarLabel>
                              {currentSessionTitle && !isGeneralSession ? currentSessionTitle : 'Message'}
                            </ChatTopBarLabel>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#242424" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                          </>
                        )}
                        {chatTitleMenuOpen && (isMobile || (currentSessionTitle && !isGeneralSession)) && (
                          <>
                            <ChatTitleOverlay onClick={(e) => { e.stopPropagation(); closeChatTitleMenu(); }} />
                            <ChatTitleMenu $closing={chatTitleMenuClosing}>
                              {/* Starter kit: mobile "Files" item
                                  removed from the chat-title dropdown to
                                  match the hidden desktop pill. Re-add by
                                  restoring the previous {isMobile && ...}
                                  ChatTitleMenuItem block. */}
                              {currentSessionTitle && !isGeneralSession && (
                                <>
                                  <ChatTitleMenuItem onClick={(e) => { e.stopPropagation(); handleChatTitleRename(); }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                                    Rename
                                  </ChatTitleMenuItem>
                                  <ChatTitleMenuItem onClick={(e) => { e.stopPropagation(); handleChatTitlePin(); }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>
                                    {currentSession?.isPinned ? 'Unpin' : 'Pin'}
                                  </ChatTitleMenuItem>
                                  <ChatTitleMenuItem $danger onClick={(e) => { e.stopPropagation(); handleChatTitleDelete(); }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                    Delete
                                  </ChatTitleMenuItem>
                                </>
                              )}
                            </ChatTitleMenu>
                          </>
                        )}
                      </ChatTopBarLeft>
                      <ChatTopBarRight>
                        <SessionFilesPanel
                          ref={filesPanelRef}
                          sessionId={currentSessionId ?? ''}
                          refreshTrigger={totalAttachmentCount}
                          isStreaming={isStreaming}
                          /* Starter kit: trigger hidden on every
                             surface so the chat header stays minimal. The
                             panel component is still mounted (drag-drop +
                             ref-based open() still work) — just no visible
                             "Files (N)" pill. Flip back to `isMobile` to
                             restore the desktop pill. */
                          hideTrigger={true}
                        />
                        {isMobile && (
                          <HeaderNewChatBtn
                            type="button"
                            aria-label="Start a new chat"
                            title="New chat"
                            onClick={handleNewChat}
                          >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                              <line x1="9" y1="10" x2="15" y2="10" />
                              <line x1="12" y1="7" x2="12" y2="13" />
                            </svg>
                          </HeaderNewChatBtn>
                        )}
                      </ChatTopBarRight>
                    </ChatTopBar>
                    <ScrollArea
                      ref={scrollAreaRef}
                      onScroll={handleScrollArea}
                      /* Tap-to-dismiss-keyboard, but only when the gesture
                         is actually a tap. Recording the start Y on
                         touchstart and comparing on touchend lets the user
                         pan the chat history while the keyboard is up
                         (the gesture has > ~10px of movement) without
                         blowing the keyboard away. A pure tap (no
                         movement) still blurs and dismisses. */
                      onTouchStart={(e) => {
                        chatTouchStartYRef.current = e.touches[0]?.clientY ?? null;
                      }}
                      onTouchEnd={(e) => {
                        const startY = chatTouchStartYRef.current;
                        chatTouchStartYRef.current = null;
                        if (startY === null) return;
                        const endY = e.changedTouches[0]?.clientY ?? startY;
                        if (Math.abs(endY - startY) >= 10) return;
                        const ae = document.activeElement as HTMLElement | null;
                        if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT')) ae.blur();
                      }}
                      style={{ flex: 1 }}
                    >
                      {/*
                        Loading UX:
                          - First-time load (no cached messages, history
                            being fetched from backend): show the centered
                            spinner — there's nothing else to render and the
                            user needs feedback.
                          - Already-loaded session being refreshed
                            (loadSession on click for a cached session, OR
                            isSyncing during a resume reconcile): no
                            indicator — the cached bubbles stay visible and
                            the refresh is silent. Avoids flicker on every
                            session switch.
                      */}
                      {isSessionLoading && messages.length === 0 ? (
                        <SessionLoadingState>
                          <Spinner size={24} />
                          <span>Loading conversation...</span>
                        </SessionLoadingState>
                      ) : (
                        <MessageList>
                          {visibleMessages.map((msg, idx) => {
                            const isLastAssistant =
                              msg.role === 'assistant' &&
                              !visibleMessages.slice(idx + 1).some((m) => m.role === 'assistant');
                            const isCurrentlyStreaming = msg.id === streamingMessageId;
                            return (
                              <ChatBubble
                                key={msg.id}
                                message={msg}
                                isLastAssistant={isLastAssistant}
                                isStreaming={isCurrentlyStreaming}
                                onRegenerate={regenerate}
                                activeTool={isCurrentlyStreaming ? activeTool : null}
                              />
                            );
                          })}
                          {showTypingIndicator && <TypingIndicator />}
                          <div ref={bottomAnchorRef} />
                        </MessageList>
                      )}
                    </ScrollArea>
                    <div style={{ flexShrink: 0 }}>
                      {/*
                        Input is disabled while:
                          - a stream is in flight (existing behavior), or
                          - the user is NOT logged in, or
                          - we're refreshing a NON-EMPTY session
                            (history fetch / lifecycle reconcile). The
                            messages.length>0 guard exempts brand-new /
                            empty sessions so a user can start typing
                            immediately without waiting for a sync to
                            complete. Race protection for non-empty
                            sessions remains intact; for empty sessions
                            `reconcileOnResume` deliberately skips the
                            active-session refresh (no overwrite to race).
                      */}
                      <ChatInput
                        sessionId={currentSessionId}
                        onSend={sendMessage}
                        onAbort={abortStream}
                        onError={showToast}
                        disabled={
                          isStreaming ||
                          (messages.length > 0 && (isSessionLoading || isSyncing)) ||
                          !authState.isLoggedIn
                        }
                        externalFiles={droppedFiles}
                        onExternalFilesProcessed={handleExternalFilesProcessed}
                      />
                    </div>
                  </ChatCard>
                </ViewContainer>
              </ViewPage>
            </ChatArea>
          )}
          </MainInner>
        </MainArea>


        {/* IntegrationsPanel removed — settings is now a full view */}

        {import.meta.env.DEV && DevSettingsOverlay && settingsOverlayOpen && (
          <Suspense fallback={null}>
            <DevSettingsOverlay
              settings={settings}
              onSave={handleSettingsSave}
              onClose={() => setSettingsOverlayOpen(false)}
            />
          </Suspense>
        )}
        {chatAreaDragOver && (
          <DropOverlay
            $closing={overlayClosing}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              const { clientX, clientY } = e;
              if (clientX <= rect.left || clientX >= rect.right || clientY <= rect.top || clientY >= rect.bottom) {
                setOverlayClosing(true);
                setTimeout(() => { setChatAreaDragOver(false); setOverlayClosing(false); }, 250);
              }
            }}
            onDrop={handleChatAreaDrop}
          >
            <DropOverlayContent>
              <DropOverlayIcons>
                <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </DropOverlayIcons>
              Drop files here to add to a task
            </DropOverlayContent>
          </DropOverlay>
        )}
      </PageShell>
      {newChatFabVisible && (
        <NewChatFab
          type="button"
          aria-label="Start a new chat"
          title="New chat"
          onClick={handleNewChat}
        >
          {/* Chat bubble with a + inside — the universal "new conversation"
              mark. Reads as both "chat" (the bubble) and "new" (the
              plus) without needing a label. */}
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            <line x1="9" y1="10" x2="15" y2="10" />
            <line x1="12" y1="7" x2="12" y2="13" />
          </svg>
        </NewChatFab>
      )}
    </>
  );
};
