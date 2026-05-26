/**
 * Sign-in bridge for the iOS app.
 *
 * Flow:
 *   1. iOS opens
 *        https://<host>/auth.html?return=<scheme>://auth
 *      inside ASWebAuthenticationSession.
 *   2. This page shows the brand mark and two provider buttons
 *      (Google + Apple). Picking one triggers Firebase
 *      signInWithRedirect — Firebase handles the OAuth round-trip
 *      and lands back here via the configured `__/auth/handler`.
 *   3. On the return load we call getRedirectResult to pull out
 *      the Firebase user + ID token, then redirect the browser
 *      to the iOS return scheme with the tokens in query params.
 *
 * The iOS app does NOT show its own provider chooser — this page is
 * the chooser. That removes the "iOS button that just opens a web
 * sign-in" double-step.
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

const $chooser = document.getElementById('chooser') as HTMLDivElement;
const $status = document.getElementById('status') as HTMLDivElement;
const $statusTitle = document.getElementById('status-title') as HTMLDivElement;
const $statusSub = document.getElementById('status-sub') as HTMLDivElement;
const $err = document.getElementById('err') as HTMLDivElement;
const $google = document.getElementById('btn-google') as HTMLButtonElement;
const $apple = document.getElementById('btn-apple') as HTMLButtonElement;

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

function readReturnURL(): string | null {
  const sources: URLSearchParams[] = [
    new URLSearchParams(window.location.search),
    new URLSearchParams(window.location.hash.replace(/^#/, '')),
  ];
  for (const s of sources) {
    const v = s.get('return');
    if (v) return v;
  }
  return null;
}

function stashReturnURL(url: string) {
  try { sessionStorage.setItem('wb_ios_return_url', url); } catch {}
}
function recallReturnURL(): string | null {
  try { return sessionStorage.getItem('wb_ios_return_url'); } catch { return null; }
}
function clearReturnURL() {
  try { sessionStorage.removeItem('wb_ios_return_url'); } catch {}
}

function showChooser() {
  $status.classList.add('hidden');
  $err.classList.add('hidden');
  $chooser.classList.remove('hidden');
}
function showStatus(title: string, sub = '') {
  $chooser.classList.add('hidden');
  $err.classList.add('hidden');
  $statusTitle.textContent = title;
  $statusSub.textContent = sub;
  $status.classList.remove('hidden');
}
function showError(message: string) {
  $chooser.classList.remove('hidden');
  $status.classList.add('hidden');
  $err.textContent = message;
  $err.classList.remove('hidden');
}

async function bounceToApp(returnURL: string, params: Record<string, string>) {
  showStatus('Returning to Wanderbot…');
  const u = new URL(returnURL);
  for (const [k, v] of Object.entries(params)) {
    if (v) u.searchParams.set(k, v);
  }
  /* Tiny delay so the user sees the "Returning…" copy instead of
     a blink. The custom scheme triggers
     ASWebAuthenticationSession's completion handler on iOS. */
  await new Promise((r) => setTimeout(r, 150));
  window.location.replace(u.toString());
}

async function startSignIn(provider: ProviderName) {
  const returnURL = readReturnURL() ?? recallReturnURL();
  if (!returnURL) {
    showError('Missing return URL — open this page from the Wanderbot iOS app.');
    return;
  }
  stashReturnURL(returnURL);
  showStatus(`Signing in with ${provider === 'google' ? 'Google' : 'Apple'}…`);
  try {
    const auth = getAuth();
    await signInWithRedirect(auth, getProvider(provider));
  } catch (err) {
    console.warn('[auth-bridge] signInWithRedirect failed', err);
    showError((err as Error).message || 'Could not start sign-in.');
  }
}

async function main() {
  const config = readConfig();
  if (!config) {
    showError('Firebase config is missing from this build.');
    return;
  }
  initializeApp(config);
  const auth = getAuth();
  /* Session persistence — the bridge page only lives for one OAuth
     round-trip; we don't want a lingering signed-in state in this
     hostname's storage. */
  await setPersistence(auth, browserSessionPersistence);

  /* If we're landing back here after a redirect sign-in, finalise
     and bounce the token back to iOS. */
  try {
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      const returnURL = recallReturnURL();
      const token = await result.user.getIdToken();
      const refresh = result.user.refreshToken;
      if (!returnURL) {
        showError('Return URL was lost between redirects.');
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
    showError((err as Error).message || 'OAuth redirect failed.');
    return;
  }

  /* Otherwise, this is the initial hit — wait for the user to
     pick a provider. */
  showChooser();
  $google.addEventListener('click', () => void startSignIn('google'));
  $apple.addEventListener('click', () => void startSignIn('apple'));
}

void main();
