import React from 'react';
import styled from 'styled-components';
import type { AppView } from '@/features/chat';

interface MobileBottomNavProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  /* Kept for API stability with the parent (TabPage still passes it).
   * The simplified mobile nav doesn't render a separate "latest chat"
   * tab — Chat is the default surface — so this callback is unused for
   * now but left in place to avoid churn in TabPage. */
  onGoToLatestChat?: () => void;
}

const Bar = styled.nav`
  display: none;

  @media (max-width: 768px) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    padding:
      4px
      56px
      calc(env(safe-area-inset-bottom, 0))
      56px;
    background: #DCE1DE;
    border-top: 1px solid rgba(36, 36, 36, 0.05);
    z-index: 60;

    /* Hide while the on-screen keyboard is actually visible — keyed off
       the body.keyboard-up class TabPage toggles from visualViewport.
       Using :has(input:focus) here would leave the nav hidden after
       iOS dismisses the keyboard but leaves focus on the textarea
       (swipe-down, mic flow, etc.). */
    body.keyboard-up & {
      display: none;
    }
  }
`;

const TabBtn = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  color: ${(p) => (p.$active ? '#242424' : 'rgba(36, 36, 36, 0.45)')};
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  -webkit-user-select: none;
  transition: transform 0.12s ease;

  &:active {
    transform: scale(0.85);
  }
`;

const ConnectionsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

const TripsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
  </svg>
);

const ChatIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ activeView, onNavigate }) => {
  /* Bar's CSS gates display by viewport (`@media (max-width: 768px)`),
     so this renders for both the native wrapper and mobile web — the
     two surfaces share the same chrome. Mobile nav matches the
     simplified sidebar: Chat and Connections only. */
  return (
    <Bar aria-label="Primary">
      <TabBtn
        $active={activeView === 'trips'}
        onClick={() => onNavigate('trips')}
        aria-label="Trips"
        aria-current={activeView === 'trips' ? 'page' : undefined}
      >
        <TripsIcon />
      </TabBtn>
      <TabBtn
        $active={activeView === 'chat'}
        onClick={() => onNavigate('chat')}
        aria-label="Chat"
        aria-current={activeView === 'chat' ? 'page' : undefined}
      >
        <ChatIcon />
      </TabBtn>
      <TabBtn
        $active={activeView === 'connections'}
        onClick={() => onNavigate('connections')}
        aria-label="Connections"
        aria-current={activeView === 'connections' ? 'page' : undefined}
      >
        <ConnectionsIcon />
      </TabBtn>
    </Bar>
  );
};

export default MobileBottomNav;
