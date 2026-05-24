/**
 * Root component that initializes the app bootstrap before rendering.
 */

import { useState, useEffect, type ReactNode } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { bootstrap } from '@/features/app/bootstrap';
import AuthGate from '@/features/auth/AuthGate';

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const fadeOut = keyframes`
  from { opacity: 1; }
  to { opacity: 0; }
`;

const LoadingShell = styled.div<{ $fading?: boolean }>`
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fbfaf9;
  z-index: 9999;

  ${(p) => p.$fading && css`
    animation: ${fadeOut} 0.4s ease-out forwards;
    pointer-events: none;
  `}
`;

const LoadingCard = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 32px;
  width: 100%;
  max-width: 440px;
  padding: 0 24px;
  box-sizing: border-box;
`;

const LoadingSpinner = styled.div`
  width: 32px;
  height: 32px;
  border: 3px solid transparent;
  border-top-color: #feeb29;
  border-radius: 50%;
  animation: ${spin} 0.8s linear infinite;
`;

const LoadingTitle = styled.h1`
  font-family: 'Inter', sans-serif;
  font-weight: 800;
  font-size: 27px;
  line-height: 36px;
  letter-spacing: -0.3px;
  color: #202020;
  text-shadow: 0px 1px 0px white;
  text-align: center;
  margin: 0;
  @media (max-width: 768px) { font-size: 22px; line-height: 30px; }
`;

const LoadingSubtitle = styled.p`
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 15px;
  line-height: 24px;
  letter-spacing: -0.3px;
  color: rgba(36, 36, 36, 0.75);
  text-align: center;
  margin: 0;
`;

const LoadingTextWrap = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
`;

const ErrorContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  padding: 20px;
  background: #242424;
  text-align: center;
`;

const ErrorCard = styled.div`
  padding: 48px 36px;
  background: #fbfaf9;
  border: 1px solid rgba(36, 36, 36, 0.75);
  border-radius: 24px;
  max-width: 480px;
  width: 100%;
`;

const ErrorTitle = styled.h2`
  color: #dc2626;
  font-family: 'Inter', sans-serif;
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 8px;
`;

const ErrorMessage = styled.p`
  color: rgba(36, 36, 36, 0.75);
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  margin: 0;
`;

interface AppRootProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function AppRoot({ children, fallback }: AppRootProps) {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    bootstrap()
      .then(() => {
        setIsReady(true);
      })
      .catch((err) => {
        console.error('[AppRoot] Bootstrap failed:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      });
  }, []);

  if (error) {
    return (
      <ErrorContainer>
        <ErrorCard>
          <ErrorTitle>Failed to initialize</ErrorTitle>
          <ErrorMessage>{error}</ErrorMessage>
        </ErrorCard>
      </ErrorContainer>
    );
  }

  if (!isReady) {
    return fallback ?? (
      <LoadingShell>
        <LoadingCard>
          <LoadingSpinner />
          <LoadingTextWrap>
            <LoadingTitle>Loading AI Assistant</LoadingTitle>
            <LoadingSubtitle>Starting up...</LoadingSubtitle>
          </LoadingTextWrap>
        </LoadingCard>
      </LoadingShell>
    );
  }

  return <AuthGate>{children}</AuthGate>;
}
