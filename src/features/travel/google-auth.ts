/**
 * Direct Google OAuth via Google Identity Services (GIS).
 *
 * Why direct: the OpenClaw integration server expects a session cookie
 * its own login flow sets, plus a Google OAuth client registered against
 * its own callback URL. Setting that up is backend work. For a
 * hackathon-grade demo we just talk to Google directly from the
 * browser using the token-client flow — postMessage delivers the
 * access token back to the opener window, no redirect-URI needed.
 *
 * The access token is short-lived (~1h) and stored in sessionStorage so
 * it survives reloads in the same tab without leaking across tabs / on
 * disk. We deliberately do NOT use a refresh token (GIS token-client
 * doesn't issue them by design); when the token expires the user
 * re-runs the popup, which is silent if Google already remembers the
 * grant.
 *
 * Required env: VITE_GOOGLE_CLIENT_ID — the OAuth client id from GCP.
 * Required Google Cloud config: add the dev origin
 * (http://localhost:5173) to the client's Authorized JavaScript
 * origins, and enable the Gmail API in the project.
 */

import { useCallback, useEffect, useState } from 'react';

export const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

interface GisTokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
}

interface GisTokenResponse {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface GoogleGlobal {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        prompt?: string;
        callback: (resp: GisTokenResponse) => void;
        error_callback?: (err: { type: string; message?: string }) => void;
      }) => GisTokenClient;
      revoke: (token: string, done?: () => void) => void;
    };
  };
}

interface GoogleUserInfo {
  email: string;
  name?: string;
  picture?: string;
  sub: string;
}

interface GoogleAuthState {
  /** Active access token, or null if not connected / expired. */
  token: string | null;
  /** Unix ms expiry of the token. */
  expiresAt: number | null;
  /** Profile of the signed-in account, fetched after first connect. */
  profile: GoogleUserInfo | null;
}

const STORAGE_KEY = 'wanderbot-google-auth-v1';

function loadFromSession(): GoogleAuthState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { token: null, expiresAt: null, profile: null };
    const parsed = JSON.parse(raw) as GoogleAuthState;
    if (!parsed.token || !parsed.expiresAt || parsed.expiresAt < Date.now()) {
      return { token: null, expiresAt: null, profile: parsed.profile ?? null };
    }
    return parsed;
  } catch {
    return { token: null, expiresAt: null, profile: null };
  }
}

function saveToSession(state: GoogleAuthState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* sessionStorage may be unavailable (Safari ITP, private mode) — proceed without persistence */
  }
}

/* Singleton script loader. The GIS script auto-attaches to
   window.google when it loads; we only need to fetch it once per
   document. */
let gisLoadPromise: Promise<GoogleGlobal> | null = null;

function loadGis(): Promise<GoogleGlobal> {
  if (gisLoadPromise) return gisLoadPromise;
  gisLoadPromise = new Promise((resolve, reject) => {
    if ((window as unknown as { google?: GoogleGlobal }).google?.accounts?.oauth2) {
      resolve((window as unknown as { google: GoogleGlobal }).google);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const g = (window as unknown as { google?: GoogleGlobal }).google;
      if (g?.accounts?.oauth2) resolve(g);
      else reject(new Error('Google Identity Services loaded but missing oauth2 namespace.'));
    };
    script.onerror = () => reject(new Error('Failed to load Google Identity Services.'));
    document.head.appendChild(script);
  });
  return gisLoadPromise;
}

async function fetchProfile(token: string): Promise<GoogleUserInfo | null> {
  try {
    const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as GoogleUserInfo;
    return data;
  } catch {
    return null;
  }
}

export interface UseGoogleAuthReturn {
  /** True when VITE_GOOGLE_CLIENT_ID is set — gates the UI. */
  available: boolean;
  /** True when GIS script is loaded and ready. */
  ready: boolean;
  /** Loading flag for the popup in flight. */
  pending: boolean;
  /** Last error from a connect attempt (shown in the UI). */
  error: string | null;
  /** Active access token, or null. */
  token: string | null;
  /** Connected Google profile, or null. */
  profile: GoogleUserInfo | null;
  /** Open the consent popup. Resolves once the token has been received (or errors). */
  connect: () => Promise<void>;
  /** Drop the local token + revoke server-side. */
  disconnect: () => Promise<void>;
  /** Returns the current token if valid, else null. */
  getAccessToken: () => string | null;
}

export function useGoogleAuth(): UseGoogleAuthReturn {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  const available = Boolean(clientId);

  const [ready, setReady] = useState(false);
  const [state, setState] = useState<GoogleAuthState>(() =>
    typeof window === 'undefined' ? { token: null, expiresAt: null, profile: null } : loadFromSession(),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Boot GIS lazily — no point fetching the script if the user never
     opens the connections panel, but cheap to do once available. */
  useEffect(() => {
    if (!available) return;
    let cancelled = false;
    loadGis()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [available]);

  /* If we hydrated with a token but no profile, hydrate the profile
     once the script is ready so the card can show the email. */
  useEffect(() => {
    if (!ready || !state.token || state.profile) return;
    let cancelled = false;
    fetchProfile(state.token).then((p) => {
      if (!cancelled && p) {
        setState((prev) => {
          const next = { ...prev, profile: p };
          saveToSession(next);
          return next;
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ready, state.token, state.profile]);

  const connect = useCallback(async () => {
    if (!clientId) {
      setError('VITE_GOOGLE_CLIENT_ID is not set.');
      return;
    }
    setError(null);
    setPending(true);
    try {
      const google = await loadGis();
      await new Promise<void>((resolve, reject) => {
        const tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: GMAIL_READONLY_SCOPE,
          callback: (resp) => {
            if (resp.error) {
              reject(new Error(resp.error_description || resp.error));
              return;
            }
            if (!resp.access_token) {
              reject(new Error('Google returned no access token.'));
              return;
            }
            const expiresAt = Date.now() + (resp.expires_in ?? 3600) * 1000;
            /* Don't await profile fetch — let it resolve below. */
            fetchProfile(resp.access_token).then((profile) => {
              const next: GoogleAuthState = {
                token: resp.access_token ?? null,
                expiresAt,
                profile,
              };
              setState(next);
              saveToSession(next);
              resolve();
            });
          },
          error_callback: (err) => reject(new Error(err.message || err.type)),
        });
        tokenClient.requestAccessToken({ prompt: state.token ? '' : 'consent' });
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }, [clientId, state.token]);

  const disconnect = useCallback(async () => {
    const tok = state.token;
    const cleared: GoogleAuthState = { token: null, expiresAt: null, profile: null };
    setState(cleared);
    saveToSession(cleared);
    if (!tok) return;
    try {
      const google = await loadGis();
      await new Promise<void>((resolve) => google.accounts.oauth2.revoke(tok, () => resolve()));
    } catch {
      /* Revocation is best-effort — the local state is already cleared,
         so the next connect will re-prompt. */
    }
  }, [state.token]);

  const getAccessToken = useCallback(() => {
    if (!state.token) return null;
    if (state.expiresAt && state.expiresAt < Date.now()) return null;
    return state.token;
  }, [state.token, state.expiresAt]);

  return {
    available,
    ready,
    pending,
    error,
    token: state.token,
    profile: state.profile,
    connect,
    disconnect,
    getAccessToken,
  };
}
