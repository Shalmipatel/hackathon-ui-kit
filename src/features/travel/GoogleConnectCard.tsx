/**
 * Connect-Gmail card. Drop it into the Connections view (or anywhere
 * else). State is local + localStorage; the actual OAuth dance lives
 * in google-connect.ts.
 */

import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { toast } from '@/features/toast';
import { connectGmail, disconnectGmail, getConnectedGmail } from './google-connect';

const Card = styled.div<{ $connected?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 18px;
  background: #fff;
  border-radius: 14px;
  border: 1px solid
    ${(p) => (p.$connected ? 'rgba(34, 197, 94, 0.45)' : 'rgba(36, 36, 36, 0.08)')};
  font-family: 'Inter', sans-serif;
`;

const Head = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const Logo = styled.div`
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, #ea4335 0%, #fbbc05 100%);
  color: #fff;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
`;

const HeadText = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

const Title = styled.div`
  font-weight: 600;
  font-size: 14px;
  color: #242424;
  letter-spacing: -0.3px;
`;

const Sub = styled.div`
  font-size: 12px;
  color: rgba(36, 36, 36, 0.6);
  line-height: 17px;
`;

const Row = styled.form`
  display: flex;
  gap: 8px;
`;

const Input = styled.input`
  flex: 1;
  min-width: 0;
  font-family: inherit;
  font-size: 13px;
  padding: 9px 12px;
  border: 1px solid rgba(36, 36, 36, 0.15);
  border-radius: 8px;
  background: #fff;
  color: #242424;

  &:focus { outline: none; border-color: rgba(36, 36, 36, 0.45); }
`;

const Btn = styled.button<{ $variant?: 'primary' | 'ghost' | 'danger' }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 500;
  padding: 9px 14px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.12s;
  border: 1px solid
    ${(p) =>
      p.$variant === 'primary'
        ? '#242424'
        : p.$variant === 'danger'
          ? 'rgba(220, 38, 38, 0.45)'
          : 'rgba(36, 36, 36, 0.18)'};
  background: ${(p) =>
    p.$variant === 'primary'
      ? '#242424'
      : p.$variant === 'danger'
        ? 'rgba(220, 38, 38, 0.08)'
        : 'transparent'};
  color: ${(p) =>
    p.$variant === 'primary'
      ? '#fff'
      : p.$variant === 'danger'
        ? '#dc2626'
        : '#242424'};

  &:hover:not(:disabled) { transform: translateY(-1px); }
  &:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
`;

const ConnectedRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  background: rgba(34, 197, 94, 0.08);
  border: 1px solid rgba(34, 197, 94, 0.2);
  border-radius: 10px;
  font-size: 13px;
  color: #15803d;
`;

const Hint = styled.div`
  font-size: 11.5px;
  color: rgba(36, 36, 36, 0.5);
  line-height: 16px;
`;

const ErrorText = styled.div`
  color: #dc2626;
  font-size: 12px;
`;

export const GoogleConnectCard: React.FC = () => {
  const [email, setEmail] = useState('');
  const [connected, setConnected] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setConnected(getConnectedGmail());
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    const result = await connectGmail(email);
    setPending(false);
    if (result.success && result.email) {
      setConnected(result.email);
      setEmail('');
      toast({
        title: 'Gmail connected',
        description: `${result.email} is now linked to your assistant.`,
      });
    } else {
      setError(result.error ?? 'Connection failed.');
    }
  }

  function onDisconnect() {
    disconnectGmail();
    setConnected(null);
    toast({
      title: 'Gmail disconnected',
      description: 'You can reconnect any time from this page.',
    });
  }

  return (
    <Card $connected={!!connected}>
      <Head>
        <Logo>G</Logo>
        <HeadText>
          <Title>Gmail</Title>
          <Sub>Let the assistant read your inbox for trip confirmations.</Sub>
        </HeadText>
      </Head>

      {connected ? (
        <ConnectedRow>
          <span>Connected as <strong>{connected}</strong></span>
          <Btn $variant="danger" onClick={onDisconnect}>
            Disconnect
          </Btn>
        </ConnectedRow>
      ) : (
        <>
          <Row onSubmit={onSubmit}>
            <Input
              type="email"
              placeholder="you@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={pending}
              autoComplete="email"
            />
            <Btn $variant="primary" type="submit" disabled={pending || !email}>
              {pending ? 'Opening…' : 'Connect'}
            </Btn>
          </Row>
          <Hint>
            We open a Google sign-in popup, then OpenClaw's gog skill
            handles the token exchange server-side. No tokens touch the
            browser.
          </Hint>
          {error && <ErrorText>{error}</ErrorText>}
        </>
      )}
    </Card>
  );
};

export default GoogleConnectCard;
