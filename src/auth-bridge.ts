/**
 * Sign-in bridge for the iOS app.
 *
 * Flow:
 *   1. iOS opens
 *        https://<host>/auth.html?provider=google|apple&return=<scheme>://auth
 *      inside ASWebAuthenticationSession.
 *   2. This page initialises Firebase, picks the provider, and triggers
 *      signInWithRedirect — Firebase handles the OAuth round-trip with
 *      Google / Apple and lands back here via the configured
 *      `__/auth/handler` callback URL.
 *   3. On the return load we call getRedirectResult to pull out the
 *      Firebase user + ID token.
 *   4. We redirect the browser to the iOS return scheme with the
 *      tokens in query params. ASWebAuthenticationSession intercepts
 *      the custom-scheme redirect, hands the URL to the app, and
 *      iOS's AuthStore parses it.
 *
 * Why this design (vs. wiring the Firebase iOS SDK):
 *   - Reuses the Firebase config already in the web bundle — no new
 *     credentials, no Swift Package Manager surgery.
 *   - Both providers go through the same Firebase OAuth handler URL,
 *     so adding more (e.g. GitHub) is a one-line provider switch.
 */

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  OAuthProvider,
  setPersistence,
  browserSessionPersistence,
  type AuthProvider,
} from 'firebase/auth';

type ProviderName = 'google' | 'apple';

const $title = document.getElementById('title')!;
const $sub = document.getElementById('sub')!;
const $err = document.getElementById('err')!;
const $spinner = document.getElementById('spinner')!;

const env = import.meta.env as Record<string, string | undefined>;

function readConfig() {
  const apiKey = env.VITE_FIREBASE_API_KEY;
  const authDomain = env.VITE_FIREBASE_AUTH_DOMAIN;
  const projectId = env.VITE_FIREBASE_PROJECT_ID;
  const appId = env.VITE_FIREBASE_APP_ID;
  if (!apiKey || !projectId || !appId) return null;
  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    databaseURL: env.VITE_FIREBASE_DATABASE_URL,
  };
}

function getProvider(name: ProviderName): AuthProvider {
  switch (name) {
    case 'google': {
      const p = new GoogleAuthProvider();
      /* Force the account picker so an accidental sign-in is easy to
         undo without diving into "remove account" UI. */
      p.setCustomParameters({ prompt: 'select_account' });
      return p;
    }
    case 'apple': {
      const p = new OAuthProvider('apple.com');
      p.addScope('email');
      p.addScope('name');
      return p;
    }
  }
}

/** Pull `provider` and `return` out of either the query string or the
 *  hash. Hash is the fallback for cases where ASWebAuthenticationSession
 *  preserves only the fragment across Firebase's redirect chain. */
function readBridgeParams(): { provider: ProviderName | null; returnURL: string | null } {
  const sources: URLSearchParams[] = [
    new URLSearchParams(window.location.search),
    new URLSearchParams(window.location.hash.replace(/^#/, '')),
  ];
  let provider: string | null = null;
  let returnURL: string | null = null;
  for (const s of sources) {
    provider ??= s.get('provider');
    returnURL ??= s.get('return');
  }
  return {
    provider: provider === 'google' || provider === 'apple' ? provider : null,
    returnURL,
  };
}

/** Re-find the return URL stashed in sessionStorage. signInWithRedirect
 *  navigates away from this page and back, so query params don't
 *  survive — sessionStorage does. */
function stashReturnURL(url: string) {
  try { sessionStorage.setItem('wb_ios_return_url', url); } catch {}
}
function recallReturnURL(): string | null {
  try { return sessionStorage.getItem('wb_ios_return_url'); } catch { return null; }
}
function clearReturnURL() {
  try { sessionStorage.removeItem('wb_ios_return_url'); } catch {}
}

function setStatus(title: string, sub = '') {
  $title.textContent = title;
  $sub.textContent = sub;
  $err.textContent = '';
  $spinner.style.display = '';
}
function setError(message: string) {
  $title.textContent = 'Sign-in failed';
  $sub.textContent = '';
  $err.textContent = message;
  $spinner.style.display = 'none';
}

async function bounceToApp(returnURL: string, params: Record<string, string>) {
  setStatus('Returning to Wanderbot…');
  const u = new URL(returnURL);
  for (const [k, v] of Object.entries(params)) {
    if (v) u.searchParams.set(k, v);
  }
  /* Tiny delay so the user sees the "Returning…" copy instead of a
     blink. The custom scheme triggers ASWebAuthenticationSession's
     completion handler on iOS. */
  await new Promise((r) => setTimeout(r, 150));
  window.location.replace(u.toString());
}

async function main() {
  const config = readConfig();
  if (!config) {
    setError('Firebase config is missing from this build.');
    return;
  }
  initializeApp(config);
  const auth = getAuth();
  /* Session persistence — the bridge page only lives for one OAuth
     round-trip; we don't want a lingering signed-in state in this
     hostname's storage. */
  await setPersistence(auth, browserSessionPersistence);

  /* First: are we landing back here after a Firebase OAuth redirect? */
  try {
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      const returnURL = recallReturnURL();
      const token = await result.user.getIdToken();
      const refresh = result.user.refreshToken;
      if (!returnURL) {
        setError('Return URL was lost between redirects.');
        return;
      }
      clearReturnURL();
      await bounceToApp(returnURL, {
        idToken: token,
        refreshToken: refresh,
        uid: result.user.uid,
        email: result.user.email ?? '',
        name: result.user.displayName ?? '',
      });
      return;
    }
  } catch (err) {
    console.warn('[auth-bridge] getRedirectResult failed', err);
    setError((err as Error).message || 'OAuth redirect failed.');
    return;
  }

  /* Otherwise, we're the initial hit — kick off the redirect. */
  const { provider, returnURL } = readBridgeParams();
  if (!provider) {
    setError('Missing provider — expected ?provider=google|apple.');
    return;
  }
  if (!returnURL) {
    setError('Missing return — expected ?return=<scheme>://...');
    return;
  }
  stashReturnURL(returnURL);
  setStatus(`Signing in with ${provider === 'google' ? 'Google' : 'Apple'}…`);
  try {
    await signInWithRedirect(auth, getProvider(provider));
  } catch (err) {
    console.warn('[auth-bridge] signInWithRedirect failed', err);
    setError((err as Error).message || 'Could not start sign-in.');
  }
}

void main();
