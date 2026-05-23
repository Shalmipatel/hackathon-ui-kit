import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import styled, { keyframes, css } from 'styled-components';
import { theme } from '@/components/theme';
import type { ChatSessionSummary } from '@/types';
import { useIsSessionStreaming, useSessionList } from '@/store';
import { useSessionActions } from '@/features/chat/useSessionActions';
import { useTimezone } from '@/features/settings/useTimezone';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';


/* ── Animations ── */

const fadeSlideIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

/* ── Styled Components ── */

const SessionItemWrapper = styled.div`
  position: relative;
  animation: ${fadeSlideIn} 0.3s ease backwards;
  display: flex;
  align-items: center;
  border-radius: 8px;
`;

const MoreButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  color: rgba(255, 255, 255, 0.5);
  border-radius: 8px;
  /*
   * Visible on the active session at rest. On touch devices (no real
   * hover) we always show the more-button so it's tappable — hiding it
   * behind a :hover rule on the parent wrapper caused a double-tap bug:
   * the first tap triggered SessionItemWrapper:hover (iOS sticky-hover),
   * which canceled the click on the session button inside; the second
   * tap would then finally fire the click.
   */
  opacity: 0;
  transition: opacity 0.15s, color 0.15s, background 0.15s;
  flex-shrink: 0;
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  -webkit-tap-highlight-color: transparent;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      color: white;
      background: rgba(255, 255, 255, 0.15);
    }

    /* Desktop: reveal on hover of the surrounding wrapper. */
    ${SessionItemWrapper}:hover & {
      opacity: 1;
    }
  }

  /* Always visible on touch (no hover reveal) + active state everywhere. */
  @media (hover: none) {
    opacity: 1;
  }
  ${SessionItemWrapper}.is-active & {
    opacity: 1;
  }

  &:active {
    background: rgba(255, 255, 255, 0.2);
    color: white;
  }
`;

const SessionItemButton = styled.button<{ $active: boolean; $hasHandle?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
  height: 58px;
  padding: 8px 40px 8px ${(p) => (p.$hasHandle ? '4px' : '20px')};
  border: none;
  border-radius: 4px;
  background: ${(p) => (p.$active ? 'rgba(255, 255, 255, 0.08)' : 'transparent')};
  cursor: pointer;
  text-align: left;
  font-family: 'Red Hat Display', ${theme.fontFamily};
  transition: background 0.15s;
  position: relative;
  outline: none;
  -webkit-tap-highlight-color: transparent;

  /*
   * Gate :hover behind real-pointer detection. Without this, iOS Safari
   * treats the first tap as "hover" (applying the hover background + delaying
   * the click) and only fires the click on the second tap — the classic
   * double-tap-to-navigate bug. Desktop still gets the hover feedback.
   */
  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background: rgba(255, 255, 255, 0.08);
    }
  }

  &:active {
    background: rgba(255, 255, 255, 0.12);
    transform: scale(0.98);
  }

  /* Yellow accent bar for active state */
  ${(p) => p.$active && css`
    &::before {
      content: '';
      position: absolute;
      left: ${p.$hasHandle ? '-20px' : '0'};
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
  font-weight: 500;
  color: white;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
  line-height: 21px;
`;

const RenameContainer = styled.div<{ $hasHandle?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
  height: 58px;
  padding: 8px 40px 8px ${(p) => (p.$hasHandle ? '4px' : '20px')};
  position: relative;
`;

const RenameInput = styled.input`
  font-size: 14px;
  font-weight: 500;
  color: white;
  margin: 0;
  width: 100%;
  line-height: 21px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(254, 235, 41, 0.5);
  border-radius: 4px;
  padding: 0 4px;
  outline: none;
  font-family: 'Red Hat Display', ${theme.fontFamily};

  &:focus {
    border-color: #feeb29;
  }
`;

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
`;

const SessionStatus = styled.p<{ $color?: string; $pulsing?: boolean }>`
  font-size: 12px;
  font-weight: 500;
  color: ${(p) => p.$color || '#71717a'};
  margin: 0;
  line-height: 18px;
  ${(p) => p.$pulsing && css`animation: ${pulse} 1.5s ease-in-out infinite;`}
`;

const UnreadBadge = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: #3b82f6;
  color: white;
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  flex-shrink: 0;
  position: absolute;
  right: 40px;
  top: 50%;
  transform: translateY(-50%);
`;

const MenuOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 99998;
  background: transparent;
`;

const ContextMenu = styled.div`
  position: fixed;
  z-index: 99999;
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  min-width: 150px;
  padding: 6px;
`;

const MenuItem = styled.button<{ $danger?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: ${(p) => (p.$danger ? '#ef4444' : 'white')};
  font-size: 13px;
  font-weight: 500;
  font-family: 'Inter', ${theme.fontFamily};
  letter-spacing: -0.3px;
  cursor: pointer;
  transition: background 0.1s;
  -webkit-tap-highlight-color: transparent;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background: rgba(255, 255, 255, 0.08);
    }
  }
  &:active {
    background: rgba(255, 255, 255, 0.12);
  }
`;

const MenuIcon = styled.span`
  width: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: inherit;
`;

/* ── Icons ── */

const PinIcon: React.FC = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="17" x2="12" y2="22" />
    <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
  </svg>
);

const DragHandle = styled.span`
  flex-shrink: 0;
  width: 20px;
  color: rgba(255, 255, 255, 0.25);
  cursor: grab;
  display: flex;
  align-items: center;
  justify-content: center;
  align-self: stretch;
  touch-action: none;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      color: rgba(255, 255, 255, 0.6);
    }
  }

  &:active {
    cursor: grabbing;
  }
`;

const GripIcon: React.FC = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="8" cy="4" r="2" /><circle cx="16" cy="4" r="2" />
    <circle cx="8" cy="12" r="2" /><circle cx="16" cy="12" r="2" />
    <circle cx="8" cy="20" r="2" /><circle cx="16" cy="20" r="2" />
  </svg>
);

const PencilIcon: React.FC = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    <path d="m15 5 4 4" />
  </svg>
);

const EllipsisIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="5" cy="12" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="19" cy="12" r="2" />
  </svg>
);

const CheckCircleIcon: React.FC = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

/* ── Helper ── */

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

interface SidePanelSessionItemProps {
  session: ChatSessionSummary;
  onSwitchSession?: (sessionId: string) => void;
  isChatView?: boolean;
  sortable?: boolean;
}

const SidePanelSessionItem: React.FC<SidePanelSessionItemProps> = ({ session, onSwitchSession, isChatView = true, sortable = false }) => {
  const { timezone } = useTimezone();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(session.title);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isSorting,
  } = useSortable({
    id: session.id,
    disabled: !sortable,
    transition: {
      duration: 300,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
    },
  });

  const isDisplaced = sortable && !isDragging && isSorting && !!transform
    && (transform.x !== 0 || transform.y !== 0);

  const isStreaming = useIsSessionStreaming(session.id);
  const { activeSessionId } = useSessionList();
  const {
    switchSession,
    deleteSession,
    pinSession,
    unpinSession,
    markComplete,
    updateStatus,
    renameSession,
  } = useSessionActions();

  const isActive = isChatView && session.id === activeSessionId;

  // Close this menu when another item opens its menu
  useEffect(() => {
    const handleClose = () => setMenuOpen(false);
    window.addEventListener('close-task-menus', handleClose);
    return () => window.removeEventListener('close-task-menus', handleClose);
  }, []);

  const handleSessionClick = useCallback(() => {
    if (onSwitchSession) {
      onSwitchSession(session.id);
    } else {
      switchSession(session.id);
    }
  }, [onSwitchSession, switchSession, session.id]);

  const handleMoreClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    window.dispatchEvent(new CustomEvent('close-task-menus'));

    // Position from the click coordinates — always accurate
    const x = e.clientX;
    const y = e.clientY;
    const menuHeight = 130;
    const menuWidth = 150;
    const spaceBelow = window.innerHeight - y;
    const spaceRight = window.innerWidth - x;

    setMenuPos({
      top: spaceBelow < menuHeight ? y - menuHeight : y,
      left: spaceRight < menuWidth ? x - menuWidth : x,
    });
    setTimeout(() => setMenuOpen(true), 0);
  }, []);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  const handlePin = useCallback(() => {
    if (session.isPinned) {
      unpinSession(session.id);
    } else {
      pinSession(session.id);
    }
    setMenuOpen(false);
  }, [session.id, session.isPinned, pinSession, unpinSession]);

  const handleRename = useCallback(() => {
    setMenuOpen(false);
    setEditValue(session.title);
    setIsEditing(true);
  }, [session.title]);

  const commitRename = useCallback(() => {
    setIsEditing(false);
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== session.title) {
      void renameSession(session.id, trimmed);
    }
  }, [editValue, session.id, session.title, renameSession]);

  const cancelRename = useCallback(() => {
    setIsEditing(false);
    setEditValue(session.title);
  }, [session.title]);

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        commitRename();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelRename();
      }
    },
    [commitRename, cancelRename],
  );

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDelete = useCallback(() => {
    deleteSession(session.id);
    setMenuOpen(false);
  }, [deleteSession, session.id]);

  const handleMarkComplete = useCallback(() => {
    markComplete(session.id);
    setMenuOpen(false);
  }, [markComplete, session.id]);

  const handleUndoComplete = useCallback(() => {
    updateStatus(session.id, 'needs_input');
    setMenuOpen(false);
  }, [updateStatus, session.id]);

  return (
    <SessionItemWrapper
      ref={(node) => { wrapperRef.current = node; setNodeRef(node); }}
      className={isActive ? 'is-active' : ''}
      style={sortable ? {
        transform: CSS.Translate.toString(transform) ?? undefined,
        transition: [transition, 'opacity 200ms ease', 'background-color 200ms ease'].filter(Boolean).join(', '),
        opacity: isDragging ? 0.3 : 1,
        ...(isDisplaced ? { backgroundColor: 'rgba(254, 235, 41, 0.06)', borderRadius: '8px' } : {}),
      } : undefined}
      {...attributes}
    >
      {sortable && (
        <DragHandle {...listeners}>
          <GripIcon />
        </DragHandle>
      )}
      {isEditing ? (
        <RenameContainer $hasHandle={sortable}>
          <RenameInput
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleRenameKeyDown}
            onBlur={commitRename}
          />
          <SessionStatus
            $color={
              isStreaming
                ? '#71717a'
                : session.status === 'needs_input'
                  ? '#f59e0b'
                  : undefined
            }
            $pulsing={isStreaming}
          >
            {isStreaming ? 'Working...' : session.status === 'needs_input' ? 'Question asked' : formatDate(session.updatedAt, timezone)}
          </SessionStatus>
        </RenameContainer>
      ) : (
        <SessionItemButton $active={isActive} $hasHandle={sortable} onClick={handleSessionClick}>
          <SessionTitle>{session.title}</SessionTitle>
          <SessionStatus
            $color={
              isStreaming
                ? '#71717a'
                : session.status === 'needs_input'
                  ? '#f59e0b'
                  : undefined
            }
            $pulsing={isStreaming}
          >
            {isStreaming ? 'Working...' : session.status === 'needs_input' ? 'Question asked' : formatDate(session.updatedAt, timezone)}
          </SessionStatus>
        </SessionItemButton>
      )}
      {session.unreadCount && session.unreadCount > 0 ? (
        <UnreadBadge>{session.unreadCount}</UnreadBadge>
      ) : null}
      <MoreButton ref={moreButtonRef} onClick={handleMoreClick} aria-label={`Options for ${session.title}`} style={menuOpen ? { opacity: 1 } : undefined}>
        <EllipsisIcon />
      </MoreButton>
      {menuOpen && createPortal(
        <>
          <MenuOverlay onClick={closeMenu} />
          <ContextMenu ref={menuRef} style={{ top: menuPos.top, left: menuPos.left }}>
            <MenuItem onClick={handleRename}>
              <MenuIcon><PencilIcon /></MenuIcon>
              Rename
            </MenuItem>
            {!session.isGeneral && (
              <MenuItem onClick={handlePin}>
                <MenuIcon><PinIcon /></MenuIcon>
                {session.isPinned ? 'Unpin' : 'Pin'}
              </MenuItem>
            )}
            {!session.isGeneral && (
              <MenuItem $danger onClick={handleDelete}>
                <MenuIcon>&#x2715;</MenuIcon>
                Delete
              </MenuItem>
            )}
          </ContextMenu>
        </>,
        document.body
      )}
    </SessionItemWrapper>
  );
};

export default SidePanelSessionItem;
