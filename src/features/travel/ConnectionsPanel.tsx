import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { useGoogleAuth } from './google-auth';

const Panel = styled.section`
  display: flex;
  flex-direction: column;
  gap: 16px;
  font-family: 'Inter', sans-serif;
`;

const SectionHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0 2px;
`;

const SectionTitle = styled.h3`
  margin: 0;
  font-weight: 600;
  font-size: 14px;
  color: #242424;
  letter-spacing: -0.3px;
`;

const SectionHint = styled.p`
  margin: 0;
  font-size: 11.5px;
  color: rgba(36, 36, 36, 0.55);
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
`;

const Row = styled.div<{ $connected?: boolean }>`
  display: grid;
  grid-template-columns: 32px 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid
    ${(p) => (p.$connected ? 'rgba(34, 197, 94, 0.45)' : 'rgba(36, 36, 36, 0.08)')};
`;

const Avatar = styled.div<{ $bg: string; $fg?: string }>`
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  background: ${(p) => p.$bg};
  color: ${(p) => p.$fg ?? '#fff'};
`;

const RowMain = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

const RowTitle = styled.div`
  font-weight: 600;
  font-size: 13.5px;
  color: #242424;
  letter-spacing: -0.3px;
`;

const RowSub = styled.div`
  font-size: 11.5px;
  color: rgba(36, 36, 36, 0.6);
  line-height: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ActionBtn = styled.button<{ $variant?: 'primary' | 'ghost' | 'connected' }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid
    ${(p) =>
      p.$variant === 'primary'
        ? '#242424'
        : p.$variant === 'connected'
          ? 'rgba(34, 197, 94, 0.55)'
          : 'rgba(36, 36, 36, 0.18)'};
  background: ${(p) =>
    p.$variant === 'primary'
      ? '#242424'
      : p.$variant === 'connected'
        ? 'rgba(34, 197, 94, 0.12)'
        : 'transparent'};
  color: ${(p) =>
    p.$variant === 'primary'
      ? '#fff'
      : p.$variant === 'connected'
        ? '#15803d'
        : '#242424'};
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 12px;
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.55;
    cursor: progress;
    transform: none;
  }
`;

const ScanCallout = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(254, 235, 41, 0.55), rgba(254, 235, 41, 0.15));
  border: 1px solid rgba(36, 36, 36, 0.12);
`;

const ScanTitle = styled.div`
  font-weight: 600;
  font-size: 13.5px;
  color: #242424;
  letter-spacing: -0.3px;
`;

const ScanBody = styled.div`
  font-size: 12px;
  color: rgba(36, 36, 36, 0.7);
  line-height: 17px;
`;

const ScanActions = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 4px;
`;

interface TravelSite {
  id: string;
  name: string;
  category: 'airline' | 'hotel' | 'rental';
  initials: string;
  bg: string;
  fg?: string;
}

const TRAVEL_SITES: TravelSite[] = [
  { id: 'delta', name: 'Delta', category: 'airline', initials: 'Δ', bg: '#c8102e' },
  { id: 'united', name: 'United', category: 'airline', initials: 'U', bg: '#002244' },
  { id: 'jal', name: 'Japan Airlines', category: 'airline', initials: 'JL', bg: '#b30000' },
  { id: 'marriott', name: 'Marriott', category: 'hotel', initials: 'M', bg: '#a82240' },
  { id: 'hyatt', name: 'Hyatt', category: 'hotel', initials: 'H', bg: '#2b3a55' },
  { id: 'airbnb', name: 'Airbnb', category: 'hotel', initials: 'A', bg: '#ff385c' },
  { id: 'booking', name: 'Booking.com', category: 'hotel', initials: 'B.', bg: '#003580' },
];

const LS_KEY = 'travel-site-connections-v1';

function loadSiteConnections(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSiteConnections(map: Record<string, boolean>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

interface ConnectionsPanelProps {
  onScanInbox?: () => void;
}

export const ConnectionsPanel: React.FC<ConnectionsPanelProps> = ({ onScanInbox }) => {
  const google = useGoogleAuth();

  const [siteConn, setSiteConn] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setSiteConn(loadSiteConnections());
  }, []);

  const gmailConnected = Boolean(google.token);

  function toggleSite(id: string) {
    setSiteConn((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      saveSiteConnections(next);
      return next;
    });
  }

  return (
    <Panel>
      <ScanCallout>
        <ScanTitle>Scan inbox for trips</ScanTitle>
        <ScanBody>
          Connect Gmail, then let the assistant pull flight, hotel, and
          activity confirmations into your trip board.
        </ScanBody>
        <ScanActions>
          <ActionBtn
            $variant="primary"
            onClick={onScanInbox}
            disabled={!gmailConnected}
            title={gmailConnected ? 'Ask the assistant to scan' : 'Connect Gmail first'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            Scan now
          </ActionBtn>
        </ScanActions>
      </ScanCallout>

      <div>
        <SectionHead>
          <SectionTitle>Google</SectionTitle>
          <SectionHint>OAuth · Gmail readonly</SectionHint>
        </SectionHead>
        <Grid style={{ marginTop: 8 }}>
          <Row $connected={gmailConnected}>
            <Avatar $bg="#ea4335">G</Avatar>
            <RowMain>
              <RowTitle>Gmail</RowTitle>
              <RowSub>
                {!google.available
                  ? 'Set VITE_GOOGLE_CLIENT_ID in .env.local to enable.'
                  : google.error
                    ? google.error
                    : gmailConnected && google.profile
                      ? `Connected as ${google.profile.email}`
                      : gmailConnected
                        ? 'Connected'
                        : 'Read flight, hotel, and activity confirmations.'}
              </RowSub>
            </RowMain>
            <ActionBtn
              $variant={gmailConnected ? 'connected' : 'primary'}
              onClick={() => (gmailConnected ? google.disconnect() : google.connect())}
              disabled={!google.available || !google.ready || google.pending}
            >
              {google.pending
                ? 'Opening…'
                : gmailConnected
                  ? 'Disconnect'
                  : 'Connect'}
            </ActionBtn>
          </Row>
        </Grid>
      </div>

      <div>
        <SectionHead>
          <SectionTitle>Travel sites</SectionTitle>
          <SectionHint>Browser login · agent drives</SectionHint>
        </SectionHead>
        <Grid style={{ marginTop: 8 }}>
          {TRAVEL_SITES.map((site) => {
            const connected = !!siteConn[site.id];
            return (
              <Row key={site.id} $connected={connected}>
                <Avatar $bg={site.bg} $fg={site.fg}>{site.initials}</Avatar>
                <RowMain>
                  <RowTitle>{site.name}</RowTitle>
                  <RowSub>
                    {connected
                      ? 'Signed in via remote browser.'
                      : `${site.category === 'airline' ? 'Airline' : site.category === 'hotel' ? 'Hotel / stay' : 'Rental'} · log in once, the agent takes it from there.`}
                  </RowSub>
                </RowMain>
                <ActionBtn
                  $variant={connected ? 'connected' : 'ghost'}
                  onClick={() => toggleSite(site.id)}
                >
                  {connected ? 'Signed in' : 'Log in'}
                </ActionBtn>
              </Row>
            );
          })}
        </Grid>
      </div>
    </Panel>
  );
};

export default ConnectionsPanel;
