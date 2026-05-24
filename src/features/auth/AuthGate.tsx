import React, { useState, type ReactNode } from 'react';
import styled from 'styled-components';
import {
  signInWithGoogle,
  signOutFirebase,
  useFirebaseUser,
} from './firebase-auth';

const Shell = styled.div`
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #fff7d6 0%, #ffe179 100%);
  font-family: 'Inter', sans-serif;
  padding: 24px;
`;

const Card = styled.div`
  width: 100%;
  max-width: 380px;
  background: #fff;
  border-radius: 20px;
  padding: 32px 28px;
  box-shadow: 0 24px 48px rgba(31, 36, 33, 0.12);
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.4px;
  color: #1F2421;
`;

const Sub = styled.p`
  margin: 0;
  font-size: 13.5px;
  line-height: 19px;
  color: rgba(31, 36, 33, 0.65);
`;

const Primary = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: #242424;
  color: #fff;
  border: none;
  font-family: inherit;
  font-weight: 600;
  font-size: 14px;
  padding: 11px 16px;
  border-radius: 12px;
  cursor: pointer;
  transition: transform 0.12s, background 0.12s;

  &:hover:not(:disabled) { transform: translateY(-1px); background: #000; }
  &:disabled { opacity: 0.6; cursor: progress; }
`;

const Ghost = styled.button`
  background: transparent;
  color: rgba(31, 36, 33, 0.65);
  border: none;
  font-family: inherit;
  font-weight: 500;
  font-size: 12.5px;
  cursor: pointer;
  padding: 6px 10px;

  &:hover { color: #1F2421; }
`;

const ErrorText = styled.div`
  color: #dc2626;
  font-size: 12.5px;
  margin-top: 4px;
`;

/** Wraps the app. Renders one of: loader, sign-in prompt,
 *  not-authorized screen, or children. */
export const AuthGate: React.FC<{ children: ReactNode }> = ({ children }) => {
  const auth = useFirebaseUser();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (auth.status === 'loading') {
    return (
      <Shell>
        <Card>
          <Title>Checking sign-in…</Title>
        </Card>
      </Shell>
    );
  }

  if (auth.status === 'bypassed' || auth.status === 'authorized') {
    return <>{children}</>;
  }

  if (auth.status === 'not-authorized') {
    return (
      <Shell>
        <Card>
          <Title>Not authorized</Title>
          <Sub>
            <strong>{auth.email}</strong> isn't on the access list for
            this app. Sign in with a different account, or ask the
            project owner to add your address.
          </Sub>
          <Primary onClick={() => signOutFirebase()}>
            Sign out
          </Primary>
        </Card>
      </Shell>
    );
  }

  // signed-out
  const onSignIn = async () => {
    setError(null);
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <Shell>
      <Card>
        <Title>Wanderbot</Title>
        <Sub>Sign in with Google to continue.</Sub>
        <Primary onClick={onSignIn} disabled={signingIn}>
          {signingIn ? 'Opening Google…' : 'Sign in with Google'}
        </Primary>
        {error && <ErrorText>{error}</ErrorText>}
      </Card>
    </Shell>
  );
};

export default AuthGate;
