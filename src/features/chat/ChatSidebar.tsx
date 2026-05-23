import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styled, { css } from 'styled-components';
import { theme } from '@/components/theme';
import type { ChatSessionSummary } from '@/types';
import { useTimezone } from '@/features/settings/useTimezone';
import { useA2HSStore } from '@/features/app/components/a2hs-store';
import { useIsMobile } from '@/components/useIsMobile';
import { default as TripList } from '@/features/travel/TripList';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import SidePanelSessionItem from './SidePanelSessionItem';
import { useSessionActions } from '@/features/chat/useSessionActions';

/* ── Styled Components ── */

const Panel = styled.aside<{ $collapsed: boolean; $mobileOpen?: boolean }>`
  position: relative;
  width: ${(p) => (p.$collapsed ? '58px' : '300px')};
  min-width: ${(p) => (p.$collapsed ? '58px' : '300px')};
  height: 100%;
  background: rgba(36, 36, 36, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 24px;
  transition: width 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94), min-width 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  overflow: hidden;
  display: flex;
  flex-direction: column;

  @media (max-width: 768px) {
    position: fixed;
    left: 0;
    top: 0;
    height: 100vh;
    height: 100dvh;
    width: 300px;
    min-width: 300px;
    z-index: 200;
    border-radius: 0;
    border: none;
    background: #242424;
    transform: ${(p) => (p.$mobileOpen ? 'translateX(0)' : 'translateX(-100%)')};
  }
`;

const PanelInner = styled.div<{ $collapsed?: boolean }>`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: ${(p) => p.$collapsed ? '16px 8px' : '16px 16px 16px 8px'};
  transition: padding 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);

  /* On mobile the Panel is fixed-positioned and fills the full viewport,
     so it has to respect iOS safe-area insets itself — otherwise its
     header collides with the Dynamic Island / status bar at the top and
     the home indicator at the bottom. */
  @media (max-width: 768px) {
    padding-top: calc(16px + env(safe-area-inset-top, 0));
    padding-bottom: calc(env(safe-area-inset-bottom, 0));
  }
`;

const ScrollableArea = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  margin-right: -16px;
  padding-right: 16px;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 3px;
  }
  &::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.25);
  }
`;

const CollapsedInner = styled.div`
  width: 64px;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16px 8px;
`;

const CollapsedTop = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 32px;
`;

const CollapsedNav = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
`;

const CollapsedIconButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: white;
  cursor: pointer;
  transition: background 0.2s ease;
  outline: none;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  svg {
    width: 24px;
    height: 24px;
  }
`;

/* ── Title row ── */

const TitleRow = styled.div<{ $collapsed?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: ${p => p.$collapsed ? 'flex-start' : 'space-between'};
  flex-shrink: 0;
  margin-bottom: 24px;
`;

const LogoGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const LogoWrap = styled.div`
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const BrandName = styled.span`
  font-family: 'Inter', ${theme.fontFamily};
  font-size: 17px;
  font-weight: 800;
  color: white;
  white-space: nowrap;
  letter-spacing: -0.3px;
`;

/* ── Action buttons ── */

const ActionSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 16px;
  flex-shrink: 0;
`;

const ActionButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  border: 1.5px dashed ${theme.colors.border};
  border-radius: 10px;
  background: transparent;
  color: ${theme.colors.textSecondary};
  font-size: 14px;
  font-weight: 600;
  font-family: ${theme.fontFamily};
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease, transform 0.15s ease;
  outline: none;

  &:hover {
    background: ${theme.colors.primaryTint};
    color: ${theme.colors.primary};
    border-color: ${theme.colors.primary}60;
    border-style: solid;
  }

  &:active {
    transform: scale(0.97);
  }
`;

/* ── Chat nav row with hover plus button ── */

const ChatNavRow = styled.div`
  display: flex;
  align-items: center;
  position: relative;
`;

const NewChatBtn = styled.button<{ $alwaysVisible?: boolean }>`
  position: absolute;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  opacity: ${p => p.$alwaysVisible ? 1 : 0};
  transition: opacity 0.15s ease, background 0.15s ease, color 0.15s ease;
  z-index: 1;

  -webkit-tap-highlight-color: transparent;

  ${ChatNavRow}:hover & {
    opacity: 1;
  }

  /* Hover only on real pointers — see NavItem's note on iOS sticky hover. */
  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background: rgba(255, 255, 255, 0.12);
      color: white;
    }
  }
  &:active {
    background: rgba(255, 255, 255, 0.18);
    color: white;
  }
`;

/* ── Chat dropdown container ── */

const ChatDropdownContainer = styled.div`
  background: rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 0 0 8px 0;
  display: flex;
  flex-direction: column;

  & > ${ChatNavRow}:first-child > button:first-child {
    border-radius: 12px 12px 4px 4px;
  }
`;

/* ── Session list ── */

const SidebarContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 0;
  margin-top: 16px;
`;

const RecentsSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const SectionLabel = styled.div`
  font-family: 'Red Hat Display', ${theme.fontFamily};
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
  padding: 0 12px;
`;

const SessionItemWrapper = styled.div`
  position: relative;
`;

const MoreButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  color: ${theme.colors.textMuted};
  border-radius: 6px;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s, background 0.15s;
  flex-shrink: 0;
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;

  &:hover {
    color: ${theme.colors.textPrimary};
    background: ${theme.colors.border};
  }

  ${SessionItemWrapper}:hover & {
    opacity: 1;
  }
`;

const SessionItem = styled.button<{ $active: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 8px 8px 8px 12px;
  padding-right: 40px;
  border: none;
  border-radius: 4px;
  background: ${(p) => (p.$active ? 'rgba(0, 0, 0, 0.05)' : 'transparent')};
  cursor: pointer;
  text-align: left;
  font-family: 'Red Hat Display', ${theme.fontFamily};
  transition: background 0.2s ease, transform 0.15s ease;
  outline: none;
  position: relative;

  &:hover {
    background: rgba(0, 0, 0, 0.05);
  }

  ${(p) => p.$active && `
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

const SessionTitle = styled.p`
  font-size: 14px;
  font-weight: 400;
  color: ${theme.colors.textPrimary};
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
  line-height: 20px;
`;

const SessionStatus = styled.p<{ $color?: string }>`
  font-size: 12px;
  font-weight: 500;
  color: ${(p) => p.$color || theme.colors.textSecondary};
  margin: 0;
  line-height: 16px;
`;

/* ── Context Menu ── */

const MenuOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 999;
`;

const ContextMenu = styled.div`
  position: absolute;
  right: 8px;
  top: 100%;
  z-index: 1000;
  background: ${theme.colors.surface};
  border: 1px solid ${theme.colors.border};
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  min-width: 140px;
  padding: 4px;
`;

const MenuItem = styled.button<{ $danger?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: ${(p) => (p.$danger ? theme.colors.error : theme.colors.textPrimary)};
  font-size: 13px;
  font-family: ${theme.fontFamily};
  cursor: pointer;
  transition: background 0.1s;

  &:hover {
    background: ${(p) => (p.$danger ? theme.colors.errorBg : theme.colors.background)};
  }
`;

const MenuIcon = styled.span`
  width: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
`;

/* ── Nav Section ── */

const NavSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex-shrink: 0;
`;

const NavItemLabel = styled.span<{ $visible: boolean }>`
  opacity: ${p => p.$visible ? 1 : 0};
  transition: opacity 0.2s ease;
  white-space: nowrap;
`;

/* Prominent yellow nav item — surfaces the Add-to-Home-Screen prompt
   in the sidebar after the user dismisses the bottom banner so they
   can still find it. Mobile-only. */
const InstallAppNavItem = styled.button`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 10px;
  background: #FEEB29;
  color: #242424;
  font-size: 13px;
  font-weight: 700;
  font-family: 'Inter', ${theme.fontFamily};
  letter-spacing: -0.3px;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.15s ease;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
  /* Hover only on real pointers — see NavItem's note. */
  @media (hover: hover) and (pointer: fine) {
    &:hover { background: #fde614; }
  }
  &:active { transform: scale(0.98); background: #fde614; }
  /* Only show in the mobile drawer — desktop sidebar doesn't need it */
  @media (min-width: 769px) { display: none; }
`;

const InstallAppIconWrap = styled.span`
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border-radius: 6px;
  background: #242424;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const NavItem = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px;
  border: none;
  border-radius: 4px;
  background: ${p => p.$active ? 'rgba(255, 255, 255, 0.08)' : 'transparent'};
  color: white;
  font-size: 13px;
  font-weight: 500;
  font-family: 'Inter', ${theme.fontFamily};
  letter-spacing: -0.3px;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.15s ease;
  position: relative;
  outline: none;
  overflow: hidden;
  /*
   * Suppress iOS's gray tap highlight — the :active style below handles
   * touch feedback without the jarring default overlay.
   */
  -webkit-tap-highlight-color: transparent;

  /*
   * Gate :hover behind (hover: hover) + (pointer: fine). On iOS Safari,
   * :hover on a tappable element causes a "sticky hover" — the first tap
   * applies hover styles and the click is suppressed so the user can see
   * the hover state; only the SECOND tap actually navigates. Desktops
   * keep the hover feedback because they have real pointers.
   */
  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background: rgba(255, 255, 255, 0.08);
    }
  }

  &:active {
    transform: scale(0.98);
    /* Give touch users immediate visual feedback since :hover is gated. */
    background: rgba(255, 255, 255, 0.12);
  }

  svg, img {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
  }
`;

const NavBadge = styled.span`
  font-size: 11px;
  font-weight: 600;
  color: ${theme.colors.textPrimary};
  background: ${theme.colors.brand};
  border-radius: 10px;
  padding: 1px 6px;
  min-width: 18px;
  text-align: center;
  margin-left: auto;
  line-height: 16px;
`;

const NavBadgeDot = styled.span`
  position: absolute;
  top: 4px;
  right: 4px;
  width: 8px;
  height: 8px;
  background: ${theme.colors.brand};
  border-radius: 50%;
  border: 1.5px solid ${theme.colors.background};
`;

const NavDivider = styled.div`
  height: 1px;
  background: ${theme.colors.border};
  margin: 8px 24px;
`;

const EmptyMessage = styled.p`
  color: ${theme.colors.textSecondary};
  font-size: 12px;
  padding: 0 8px;
  margin: 0;
`;

/* ── Drag Overlay ── */

const DragOverlayItem = styled.div`
  display: flex;
  align-items: center;
  border-radius: 8px;
  background: rgba(50, 50, 50, 0.95);
  box-shadow: 0 0 0 1px rgba(254, 235, 41, 0.3), 0 16px 40px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
  cursor: grabbing;
`;

const DragOverlayHandle = styled.span`
  flex-shrink: 0;
  width: 20px;
  color: rgba(255, 255, 255, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  align-self: stretch;
`;

const DragOverlayContent = styled.div`
  flex: 1;
  min-width: 0;
  height: 58px;
  padding: 8px 12px 8px 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  justify-content: center;
`;

const DragOverlayTitle = styled.p`
  font-family: 'Red Hat Display', ${theme.fontFamily};
  font-size: 14px;
  font-weight: 500;
  color: white;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 21px;
`;

const DragOverlayStatusText = styled.p`
  font-size: 12px;
  font-weight: 500;
  color: #71717a;
  margin: 0;
  line-height: 18px;
`;

/* ── User Profile ── */

const ProfileMenuWrapper = styled.div`
  position: relative;
`;

const ProfileMenu = styled.div`
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  right: 0;
  z-index: 1000;
  background: #2a2a2a;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  padding: 4px;
  min-width: 200px;
`;

const ProfileMenuItem = styled.button`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.85);
  font-size: 13px;
  font-weight: 500;
  font-family: 'Inter', ${theme.fontFamily};
  cursor: pointer;
  transition: background 0.15s;
  outline: none;
  -webkit-tap-highlight-color: transparent;

  /* Hover only on real pointers — see NavItem's note on iOS sticky hover. */
  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background: rgba(255, 255, 255, 0.08);
    }
  }
  &:active { background: rgba(255, 255, 255, 0.12); }

  svg {
    flex-shrink: 0;
  }
`;

const UserAvatar = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: ${theme.colors.primary};
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  flex-shrink: 0;
  text-transform: uppercase;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const UserInfo = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
`;

const UserName = styled.span`
  font-size: 13px;
  font-weight: 500;
  color: white;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
  line-height: 18px;
`;

const UserEmail = styled.span`
  font-size: 11px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
  line-height: 16px;
`;

const BetaNotice = styled.p`
  margin: 0;
  padding: 4px 8px 0;
  font-size: 10px;
  font-weight: 400;
  line-height: 1.4;
  letter-spacing: -0.1px;
  color: rgba(255, 255, 255, 0.45);
  text-align: left;
`;

/* ── SVG Icons ── */

const ArrowLeftToLineIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 19V5" />
    <path d="m13 6-6 6 6 6" />
    <path d="M7 12h14" />
  </svg>
);

const CirclePlusIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M8 12h8" />
    <path d="M12 8v8" />
  </svg>
);

const GearIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const PinIcon: React.FC = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="17" x2="12" y2="22" />
    <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
  </svg>
);

const EllipsisIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="5" cy="12" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="19" cy="12" r="2" />
  </svg>
);

/* ── Helpers ── */

function getInitials(name?: string, email?: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email) return email[0].toUpperCase();
  return '?';
}

function formatDate(timestamp: number, timeZone?: string): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    month: '2-digit',
    day: '2-digit',
    year: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  });
}

/* ── Component ── */

export type AppView = 'trips' | 'security' | 'chat' | 'connections' | 'settings';

interface ChatSidebarProps {
  collapsed: boolean;
  mobileOpen?: boolean;
  sessions: ChatSessionSummary[];
  currentSessionId: string | null;
  isStreaming: boolean;
  activeView: AppView;
  userDisplayName?: string;
  userEmail?: string;
  userPicture?: string;
  onToggleCollapse: () => void;
  onNewTask: () => void;
  onNavigate: (view: AppView) => void;
  onSwitchSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onPinSession: (sessionId: string) => void;
  onUnpinSession: (sessionId: string) => void;
  onMarkComplete?: (sessionId: string) => void;
  onUndoComplete?: (sessionId: string) => void;
  onLogout: () => void | Promise<void>;
}

/* ── SVG Icons for view toggle ── */

const ListIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

const KanbanIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /><path d="M15 3v18" />
  </svg>
);

const CheckCircleIcon: React.FC = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

/* Nav SVG Icons — outline (inactive) + filled (active) */

const HomeIcon: React.FC<{ filled?: boolean }> = ({ filled }) => filled ? (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M12 2.1L1 12h3v9a1 1 0 001 1h5v-6h4v6h5a1 1 0 001-1v-9h3L12 2.1z" />
  </svg>
) : (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const ClockIcon: React.FC<{ filled?: boolean }> = ({ filled }) => filled ? (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 11h-2V7h2v4h3v2h-3z" />
  </svg>
) : (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const ShieldIcon: React.FC<{ filled?: boolean }> = ({ filled }) => filled ? (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
  </svg>
) : (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const GearIconNav: React.FC<{ filled?: boolean }> = ({ filled }) => filled ? (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M19.14 12.94a7.07 7.07 0 000-1.88l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96a7.04 7.04 0 00-1.63-.94l-.36-2.54a.48.48 0 00-.48-.41h-3.84a.48.48 0 00-.48.41l-.36 2.54c-.59.22-1.13.53-1.63.94l-2.39-.96a.49.49 0 00-.59.22L2.74 9.87a.49.49 0 00.12.61l2.03 1.58a7.07 7.07 0 000 1.88l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.38.31.59.22l2.39-.96c.5.41 1.04.72 1.63.94l.36 2.54c.05.24.26.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.22 1.13-.53 1.63-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 00-.12-.61l-2.03-1.58zM12 15.5A3.5 3.5 0 1112 8.5a3.5 3.5 0 010 7z" />
  </svg>
) : (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const ChatSidebar: React.FC<ChatSidebarProps> = ({
  collapsed,
  mobileOpen = false,
  sessions,
  currentSessionId,
  isStreaming,
  activeView,
  userDisplayName,
  userEmail,
  userPicture,
  onToggleCollapse,
  onNewTask,
  onNavigate,
  onSwitchSession,
  onDeleteSession,
  onPinSession,
  onUnpinSession,
  onMarkComplete,
  onUndoComplete,
  onLogout,
}) => {
  const { timezone } = useTimezone();
  /* Mobile (web + native) shows the bottom nav for Home and Calendar,
     so those entries don't need to live in the side drawer too. */
  const isMobile = useIsMobile();

  // Add-to-Home-Screen prompt: surface the install entry point in the
  // sidebar after the user dismisses the bottom banner so it doesn't
  // disappear permanently. Only renders on mobile iOS Safari.
  const a2hsEligible = useA2HSStore((s) => s.eligible);
  const a2hsBannerDismissed = useA2HSStore((s) => s.bannerDismissed);
  const a2hsOpenOverlay = useA2HSStore((s) => s.openOverlay);
  const showInstallNav = a2hsEligible && a2hsBannerDismissed;

  const generalSession = sessions.find((s) => s.isGeneral || s.id === 'general') ?? null;
  const taskSessions = sessions.filter((s) => !s.isGeneral && s.id !== 'general');
  const pinnedSessions = useMemo(
    () => taskSessions
      .filter((s) => s.isPinned)
      .sort((a, b) => (a.pinnedOrder ?? 0) - (b.pinnedOrder ?? 0)),
    [taskSessions],
  );
  const pinnedIds = useMemo(() => pinnedSessions.map((s) => s.id), [pinnedSessions]);
  const unpinnedSessions = taskSessions.filter((s) => !s.isPinned);

  const { reorderPinnedSessions } = useSessionActions();

  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const [profileMenuPos, setProfileMenuPos] = useState<{ bottom: number; left: number } | null>(null);

  const toggleProfileMenu = useCallback(() => {
    setProfileMenuOpen((open) => {
      if (!open && profileButtonRef.current) {
        const rect = profileButtonRef.current.getBoundingClientRect();
        setProfileMenuPos({
          bottom: window.innerHeight - rect.top + 8,
          left: rect.left,
        });
      }
      return !open;
    });
  }, []);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const onResize = () => {
      if (profileButtonRef.current) {
        const rect = profileButtonRef.current.getBoundingClientRect();
        setProfileMenuPos({
          bottom: window.innerHeight - rect.top + 8,
          left: rect.left,
        });
      }
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [profileMenuOpen]);

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const activeDragSession = activeDragId
    ? pinnedSessions.find((s) => s.id === activeDragId) ?? null
    : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = pinnedIds.indexOf(active.id as string);
      const newIndex = pinnedIds.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(pinnedIds, oldIndex, newIndex);
      reorderPinnedSessions(reordered);
    },
    [pinnedIds, reorderPinnedSessions],
  );

  const handleDragCancel = useCallback(() => {
    setActiveDragId(null);
  }, []);

  const dropAnimationConfig = {
    duration: 300,
    easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
    sideEffects: defaultDropAnimationSideEffects({
      styles: { active: { opacity: '0' } },
    }),
  };

  return (
    <Panel $collapsed={collapsed} $mobileOpen={mobileOpen}>
      <PanelInner $collapsed={collapsed}>
        {/* Brand / Toggle row */}
        <TitleRow $collapsed={collapsed}>
          {!collapsed && (
            <LogoGroup onClick={() => onNavigate('chat')} style={{ cursor: 'pointer', paddingLeft: 6 }}>
              <LogoWrap>
                <svg width="28" height="28" viewBox="0 0 36 36" fill="none">
                  <rect width="36" height="36" rx="18" fill="#FEEB29" />
                  <path d="M18 7.5l9 3.5v7.7c0 4.7-3 8.8-9 10.8-6-2-9-6.1-9-10.8V11l9-3.5Z" fill="#242424" />
                  <path d="M13.4 18.2 16.8 22l6-7.8" stroke="#FEEB29" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </LogoWrap>
              <BrandName>AI Assistant</BrandName>
            </LogoGroup>
          )}
          <button onClick={onToggleCollapse} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, display: 'flex', alignItems: 'center', borderRadius: 8, flexShrink: 0 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="16" x="4" y="4" rx="2"/><path d="M10 4v16"/></svg>
          </button>
        </TitleRow>

        <ScrollableArea>
          {/* Navigation -- 5 main tabs */}
          <NavSection>
            {showInstallNav && (
              <InstallAppNavItem
                type="button"
                onClick={a2hsOpenOverlay}
                aria-label="Install this app on your home screen"
              >
                <InstallAppIconWrap>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FEEB29" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    {/* Phone with arrow-down → "save to phone" */}
                    <rect x="6" y="2" width="12" height="20" rx="2" />
                    <path d="M12 8v6" />
                    <path d="m9 11 3 3 3-3" />
                  </svg>
                </InstallAppIconWrap>
                <NavItemLabel $visible={!collapsed}>Install app</NavItemLabel>
              </InstallAppNavItem>
            )}
            <NavItem $active={activeView === 'trips'} onClick={() => onNavigate('trips')}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
              </svg>
              <NavItemLabel $visible={!collapsed}>Trips</NavItemLabel>
            </NavItem>
            {/* When viewing trips with the sidebar expanded, surface the
                trip list inline here so the rest of the trips view is
                free to be a single content column (map + itinerary +
                chat) instead of having its own left rail. */}
            {activeView === 'trips' && !collapsed && (
              <div style={{ padding: '8px 4px 4px' }}>
                <TripList />
              </div>
            )}
            <NavItem $active={activeView === 'connections'} onClick={() => onNavigate('connections')}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              <NavItemLabel $visible={!collapsed}>Connections</NavItemLabel>
            </NavItem>
            {/*
             * Chat dropdown: clicking the row opens the chat view, the "+"
             * button starts a brand-new chat session, and the expanded
             * panel lists the General Chat, pinned chats (drag-to-reorder),
             * and recent chats.
             */}
            <ChatDropdownContainer>
              <ChatNavRow>
                <NavItem $active={activeView === 'chat'} onClick={() => onNavigate('chat')} style={{ flex: 1 }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  <NavItemLabel $visible={!collapsed}>Chat with assistant</NavItemLabel>
                </NavItem>
                {!collapsed && (
                  <NewChatBtn $alwaysVisible onClick={(e) => { e.stopPropagation(); onNewTask(); }} title="New chat">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </NewChatBtn>
                )}
              </ChatNavRow>
              {!collapsed && (
                <SidebarContent>
                  {generalSession && (
                    <SidePanelSessionItem
                      key={generalSession.id}
                      session={{ ...generalSession, title: 'General Chat' }}
                      onSwitchSession={onSwitchSession}
                      isChatView={activeView === 'chat'}
                    />
                  )}
                  {pinnedSessions.length > 0 && (
                    <RecentsSection>
                      <SectionLabel>Pinned chats</SectionLabel>
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
                        <SortableContext items={pinnedIds} strategy={verticalListSortingStrategy}>
                          {pinnedSessions.map((session) => (
                            <SidePanelSessionItem key={session.id} session={session} onSwitchSession={onSwitchSession} isChatView={activeView === 'chat'} sortable />
                          ))}
                        </SortableContext>
                        <DragOverlay dropAnimation={dropAnimationConfig}>
                          {activeDragSession ? (
                            <DragOverlayItem>
                              <DragOverlayHandle>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                  <circle cx="8" cy="4" r="2" /><circle cx="16" cy="4" r="2" />
                                  <circle cx="8" cy="12" r="2" /><circle cx="16" cy="12" r="2" />
                                  <circle cx="8" cy="20" r="2" /><circle cx="16" cy="20" r="2" />
                                </svg>
                              </DragOverlayHandle>
                              <DragOverlayContent>
                                <DragOverlayTitle>{activeDragSession.title}</DragOverlayTitle>
                                <DragOverlayStatusText>
                                  {formatDate(activeDragSession.updatedAt, timezone)}
                                </DragOverlayStatusText>
                              </DragOverlayContent>
                            </DragOverlayItem>
                          ) : null}
                        </DragOverlay>
                      </DndContext>
                    </RecentsSection>
                  )}
                  {(pinnedSessions.length > 0 || unpinnedSessions.length > 0) && (
                    <RecentsSection>
                      <SectionLabel>Recent chats</SectionLabel>
                      {unpinnedSessions.map((session) => (
                        <SidePanelSessionItem key={session.id} session={session} onSwitchSession={onSwitchSession} isChatView={activeView === 'chat'} />
                      ))}
                    </RecentsSection>
                  )}
                </SidebarContent>
              )}
            </ChatDropdownContainer>
          </NavSection>
        </ScrollableArea>

        {/* Bottom: user profile */}
        <div style={{ borderTop: collapsed ? 'none' : '1px solid rgba(255, 255, 255, 0.1)', paddingTop: collapsed ? 8 : 12, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <ProfileMenuWrapper>
            {profileMenuOpen && profileMenuPos && createPortal(
              <>
                <MenuOverlay onClick={() => setProfileMenuOpen(false)} />
                <ProfileMenu
                  style={{
                    position: 'fixed',
                    bottom: profileMenuPos.bottom,
                    left: profileMenuPos.left,
                    right: 'auto',
                  }}
                >
                  <ProfileMenuItem onClick={() => { onNavigate('settings'); setProfileMenuOpen(false); }}>
                    <GearIcon />
                    Settings
                  </ProfileMenuItem>
                  <div style={{ height: 1, background: 'rgba(255, 255, 255, 0.08)', margin: '4px 8px' }} />
                  <ProfileMenuItem
                    onClick={() => {
                      setProfileMenuOpen(false);
                      void onLogout();
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Log out
                  </ProfileMenuItem>
                </ProfileMenu>
              </>,
              document.body
            )}
            {collapsed ? (
              <NavItem
                ref={profileButtonRef}
                $active={activeView === 'settings'}
                onClick={toggleProfileMenu}
                style={{ justifyContent: 'center' }}
              >
                <UserAvatar>
                  {userPicture ? <img src={userPicture} alt="" referrerPolicy="no-referrer" /> : getInitials(userDisplayName, userEmail)}
                </UserAvatar>
              </NavItem>
            ) : (
              <NavItem
                ref={profileButtonRef}
                $active={activeView === 'settings'}
                onClick={toggleProfileMenu}
                style={{ gap: 10, padding: '10px 8px' }}
              >
                <UserAvatar>
                  {userPicture ? <img src={userPicture} alt="" referrerPolicy="no-referrer" /> : getInitials(userDisplayName, userEmail)}
                </UserAvatar>
                <UserInfo>
                  <UserName>{userDisplayName || 'User'}</UserName>
                  <UserEmail>{userEmail || ''}</UserEmail>
                </UserInfo>
              </NavItem>
            )}
          </ProfileMenuWrapper>
          {!collapsed && (
            <BetaNotice>
              Your personal AI assistant. Wire up your backend in{' '}
              <code>.env.local</code> and customize the app for whatever
              you want to build.
            </BetaNotice>
          )}
        </div>
      </PanelInner>
    </Panel>
  );
};

export default ChatSidebar;
