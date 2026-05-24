/**
 * Connect-Gmail card. Drop it into the Connections view (or anywhere
 * else). State is local + localStorage; the actual OAuth dance lives
 * in google-connect.ts.
 */

import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { toast } from '@/features/toast';
import { getChatStore } from '@/features/app/bootstrap';
import { GENERAL_SESSION_ID } from '@/types/chat-session';
import { useSendMessage } from '@/features/chat/useSendMessage';
import {
  buildGogCommandPrompt,
  connectGmail,
  disconnectGmail,
  getConnectedGmail,
} from './google-connect';
import {
  subscribeToAuthRequest,
  writeAuthRequest,
  type AuthRequest,
} from './firebase';

const Card = styled.div<{ $connected?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 18px;
  background: #fff;
  border-radius: 14px;
  border: 1px solid
    ${(p) => (p.$connected ? 'rgba(73, 160, 120, 0.45)' : 'rgba(36, 36, 36, 0.08)')};
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
  background: rgba(73, 160, 120, 0.08);
  border: 1px solid rgba(73, 160, 120, 0.2);
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

const StatusRow = styled.div<{ $tone: ProcessStatus }>`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 12.5px;
  line-height: 17px;
  color: ${(p) =>
    p.$tone === 'success'
      ? '#15803d'
      : p.$tone === 'error'
        ? '#b91c1c'
        : 'rgba(36, 36, 36, 0.78)'};
  background: ${(p) =>
    p.$tone === 'success'
      ? 'rgba(73, 160, 120, 0.1)'
      : p.$tone === 'error'
        ? 'rgba(220, 38, 38, 0.08)'
        : 'rgba(36, 36, 36, 0.04)'};
  border: 1px solid
    ${(p) =>
      p.$tone === 'success'
        ? 'rgba(73, 160, 120, 0.3)'
        : p.$tone === 'error'
          ? 'rgba(220, 38, 38, 0.35)'
          : 'rgba(36, 36, 36, 0.1)'};

  pre {
    margin: 4px 0 0;
    font-family: ui-monospace, monospace;
    font-size: 11.5px;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 120px;
    overflow-y: auto;
    color: inherit;
  }
`;

type ProcessStatus = 'idle' | 'processing' | 'success' | 'error';

export const GoogleConnectCard: React.FC = () => {
  const [email, setEmail] = useState('');
  const [connected, setConnected] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processStatus, setProcessStatus] = useState<ProcessStatus>('idle');
  const [processMessage, setProcessMessage] = useState<string | null>(null);
  const subRef = useRef<(() => void) | null>(null);
  const sendMessage = useSendMessage();

  useEffect(() => {
    setConnected(getConnectedGmail());
  }, []);

  /* Cleanup RTDB subscription on unmount so a stale subscription
     doesn't keep firing if the user navigates away mid-handoff. */
  useEffect(() => () => {
    if (subRef.current) subRef.current();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    setProcessStatus('idle');
    setProcessMessage(null);
    setPending(true);
    const result = await connectGmail(email);
    setPending(false);
    if (!result.success || !result.email || !result.authUrl || !result.code || !result.state || !result.redirectUri) {
      setError(result.error ?? 'Connection failed.');
      return;
    }

    /* Persist the auth request to RTDB so the backend / agent has a
       durable record to operate on instead of relying on the chat
       message body alone. */
    const requestId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const authRequest: AuthRequest = {
      id: requestId,
      email: result.email,
      code: result.code,
      state: result.state,
      authUrl: result.authUrl,
      redirectUri: result.redirectUri,
      services: 'gmail',
      status: 'pending',
      createdAt: Date.now(),
    };
    await writeAuthRequest(authRequest);

    /* Route the gog command into the general chat session so it
       doesn't pollute trip-specific transcripts. */
    let previousSession: string | null = null;
    try {
      const chat = getChatStore();
      previousSession = chat.getState().activeSessionId;
      chat.getState().setActiveSession(GENERAL_SESSION_ID);
    } catch (err) {
      console.warn('[gog-connect] chat store unavailable', err);
    }

    const prompt = buildGogCommandPrompt({
      requestId,
      email: result.email,
      authUrl: result.authUrl,
      redirectUri: result.redirectUri,
    });
    sendMessage(prompt);

    setTimeout(() => {
      if (previousSession && previousSession !== GENERAL_SESSION_ID) {
        try {
          getChatStore().getState().setActiveSession(previousSession);
        } catch { /* non-fatal */ }
      }
    }, 50);

    /* Subscribe to the RTDB record so we flip from Processing →
       Connected / Error the moment the agent writes status back. */
    setProcessStatus('processing');
    setProcessMessage('Waiting for the assistant to finish the gog handoff…');
    if (subRef.current) subRef.current();
    subRef.current = subscribeToAuthRequest(requestId, (req) => {
      if (!req) return;
      if (req.status === 'success') {
        setProcessStatus('success');
        setProcessMessage(req.stdout?.trim() || 'gog reported success.');
        try { localStorage.setItem('gog-connected-email', authRequest.email); } catch { /* non-fatal */ }
        setConnected(authRequest.email);
        setEmail('');
        toast({
          title: 'Gmail connected',
          description: `${authRequest.email} is linked via gog.`,
        });
        if (subRef.current) { subRef.current(); subRef.current = null; }
      } else if (req.status === 'error') {
        setProcessStatus('error');
        setProcessMessage(req.stderr?.trim() || req.message || 'gog reported an error.');
        toast({
          title: 'gog handoff failed',
          description: req.stderr?.slice(0, 240) || 'See the chat for the agent\'s reply.',
        });
        if (subRef.current) { subRef.current(); subRef.current = null; }
      }
    });

    toast({
      title: 'Gmail handoff sent',
      description: `Asked the assistant to run gog auth for ${authRequest.email}. The result will appear here when it finishes.`,
      duration: 5500,
    });
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
          {processStatus !== 'idle' && (
            <StatusRow $tone={processStatus}>
              <strong>
                {processStatus === 'processing' && 'Linking via gog…'}
                {processStatus === 'success' && 'gog linked the account.'}
                {processStatus === 'error' && 'gog reported an error.'}
              </strong>
              {processMessage && <pre>{processMessage}</pre>}
            </StatusRow>
          )}
        </>
      )}
    </Card>
  );
};

export default GoogleConnectCard;
