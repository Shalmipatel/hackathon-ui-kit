import { useState, useEffect, useCallback } from 'react';
import type { AuthState, AuthStrategyConfig } from '@/types';
import { DEFAULT_AUTH_STATE } from '@/types';
import { getAuthProvider } from '@/features/app/bootstrap/providers';

/**
 * Starter-kit useAuth. The auth provider is always StubAuthProvider, so
 * authState immediately resolves to "logged in" with a fake user.
 *
 * `signIn` is intentionally a no-op — there's no sign-in UI in this kit.
 * Swap StubAuthProvider for a real IAuthRepository and re-introduce a
 * sign-in flow if you need real authentication.
 */

interface UseAuthReturn {
  authState: AuthState;
  loading: boolean;
  strategy: AuthStrategyConfig;
  checkAuth: () => Promise<void>;
  signIn: () => void;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string>;
}

export function useAuth(): UseAuthReturn {
  const [authState, setAuthState] = useState<AuthState>(DEFAULT_AUTH_STATE);
  const [loading, setLoading] = useState(true);

  const strategy = getAuthProvider().strategy;

  const fetchAuthState = useCallback(async (skipCache = false) => {
    try {
      const state = await getAuthProvider().getAuthState({ skipCache });
      setAuthState(state);
    } catch {
      setAuthState(DEFAULT_AUTH_STATE);
    }
  }, []);

  const checkAuth = useCallback(async () => {
    await fetchAuthState(true);
  }, [fetchAuthState]);

  const signIn = useCallback(() => {
    /* no-op in the starter kit — there is no sign-in flow */
  }, []);

  const signOut = useCallback(async () => {
    await getAuthProvider().signOut();
    setAuthState(DEFAULT_AUTH_STATE);
  }, []);

  const getAccessToken = useCallback(async (): Promise<string> => {
    return getAuthProvider().getAccessToken();
  }, []);

  useEffect(() => {
    fetchAuthState().finally(() => setLoading(false));
  }, [fetchAuthState]);

  return { authState, loading, strategy, checkAuth, signIn, signOut, getAccessToken };
}
