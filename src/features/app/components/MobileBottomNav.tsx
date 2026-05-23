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
    background: #fbfaf9;
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

const HomeIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const ConnectionsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
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
        $active={activeView === 'chat'}
        onClick={() => onNavigate('chat')}
        aria-label="Chat"
        aria-current={activeView === 'chat' ? 'page' : undefined}
      >
        <HomeIcon />
      </TabBtn>
      <TabBtn
        $active={activeView === 'connections'}
        onClick={() => onNavigate('connections')}
        aria-label="Browser connections"
        aria-current={activeView === 'connections' ? 'page' : undefined}
      >
        <ConnectionsIcon />
      </TabBtn>
    </Bar>
  );
};

export default MobileBottomNav;
