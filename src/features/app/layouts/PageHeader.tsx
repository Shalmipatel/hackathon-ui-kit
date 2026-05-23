import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useWeather } from '@/features/app/hooks/useWeather';
import { useIsMobile } from '@/components/useIsMobile';
import { formatTimestamp12 } from '@/core/utils';
import { useTimezone } from '@/features/settings/useTimezone';
import WeatherIcon from './WeatherIcon';

const Wrap = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  width: 100%;

  /* Rendered as a direct flex child of ChatArea *above* ViewPage's
     scroll container, so ViewPage's scrollbar only spans the actual
     scrollable area instead of running behind this bar. Position is
     just relative — being outside the scroll container means we don't
     need sticky.

     The ::after fade extends just past the bar's bottom into ViewPage's
     top region (z-index 60 stacks above ViewPage's auto stacking) so
     scrolling content washes out as it passes under, same look across
     desktop and mobile (matches HomeView). */
  position: relative;
  z-index: 60;
  padding: 28px 48px 16px;
  background: #fbfaf9;

  &::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    height: 16px;
    pointer-events: none;
    background: linear-gradient(
      to bottom,
      #fbfaf9 0%,
      rgba(251, 250, 249, 0) 100%
    );
  }

  @media (max-width: 768px) {
    padding: 12px 16px;
  }
`;

const Left = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
`;

const MobileMenuBtn = styled.button`
  display: none;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  @media (max-width: 768px) { display: flex; }
`;

const Title = styled.h1`
  font-family: 'Inter', sans-serif;
  font-weight: 800;
  font-size: 24px;
  line-height: 49px;
  color: #242424;
  margin: 0;
  letter-spacing: -0.3px;
  text-shadow: 0px 1px 0px white;
  @media (max-width: 768px) { font-size: 20px; line-height: 28px; }
`;

const Right = styled.div`
  display: flex;
  align-items: center;
  gap: 48px;
  @media (max-width: 768px) { gap: 12px; }
`;

const TimeWeatherRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 15px;
  color: #242424;
  letter-spacing: -0.3px;
  line-height: 24px;
  @media (max-width: 768px) { display: none; }
`;

const ClickableInfo = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: none;
  padding: 4px 8px;
  margin: -4px -8px;
  border-radius: 8px;
  font-family: inherit;
  font-weight: inherit;
  font-size: inherit;
  color: inherit;
  letter-spacing: inherit;
  line-height: inherit;
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: rgba(36, 36, 36, 0.05);
  }
`;

const TimeSep = styled.span`
  width: 0;
  height: 22px;
  border-left: 1px solid rgba(36, 36, 36, 0.2);
`;

const AskButton = styled.button`
  height: 44px;
  padding: 0 24px;
  background: #feeb29;
  border: 3px solid #242424;
  border-radius: 24px;
  font-family: 'Inter', sans-serif;
  font-weight: 800;
  font-size: 13px;
  color: #242424;
  cursor: pointer;
  white-space: nowrap;
  letter-spacing: -0.3px;
  transition: background 0.15s, transform 0.1s;
  &:hover { background: #fde614; }
  &:active { transform: scale(0.98); }
`;

interface PageHeaderProps {
  title: string;
  onNavigate: (view: string) => void;
  /**
   * Start a brand-new chat session. When provided, the yellow "New chat"
   * pill in the header calls this (which creates a fresh session AND
   * navigates to the chat view) instead of just navigating. Without it
   * the button falls back to `onNavigate('chat')` — same as before.
   */
  onNewChat?: () => void;
  onOpenMobileMenu?: () => void;
}

const PageHeader: React.FC<PageHeaderProps> = ({ title, onNavigate, onNewChat, onOpenMobileMenu }) => {
  const { timezone } = useTimezone();
  const { weather } = useWeather();
  const isMobile = useIsMobile();
  const tz = timezone || undefined;
  const [time, setTime] = useState(() => formatTimestamp12(new Date(), tz));

  useEffect(() => {
    setTime(formatTimestamp12(new Date(), tz));
    const t = setInterval(() => setTime(formatTimestamp12(new Date(), tz)), 1000);
    return () => clearInterval(t);
  }, [tz]);

  return (
    <Wrap>
      <Left>
        {onOpenMobileMenu && (
          <MobileMenuBtn onClick={onOpenMobileMenu} aria-label="Open menu">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#242424" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="16" x="4" y="4" rx="2"/><path d="M10 4v16"/></svg>
          </MobileMenuBtn>
        )}
        <Title>{title}</Title>
      </Left>
      <Right>
      <ClickableInfo onClick={() => onNavigate('settings')} title="Change timezone">
        <TimeWeatherRow>
          {time}
          <TimeSep />
          <WeatherIcon code={weather?.weatherCode} description={weather?.description} />
            {weather ? `${weather.temperature}° F` : '--° F'}
        </TimeWeatherRow>
        </ClickableInfo>
        {/* Mobile (web + native) shows the bottom nav with a chat tab,
            so the yellow header button is desktop-only. */}
        {!isMobile && (
          <AskButton onClick={() => (onNewChat ? onNewChat() : onNavigate('chat'))}>
            New chat
          </AskButton>
        )}
      </Right>
    </Wrap>
  );
};

export default PageHeader;
