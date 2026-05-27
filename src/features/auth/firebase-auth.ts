/**
 * Frontend-only Firebase Auth gate.
 *
 * This is orthogonal to features/auth/useAuth.ts (which handles the
 * openclaw gateway auth). Firebase Auth here just decides whether to
 * render the app UI at all — it does NOT replace the openclaw bearer
 * (that's still in the JS bundle for hackathon mode).
 *
 * Allow-list approach: we have one shared openclaw instance and only
 * a handful of trusted emails should reach the UI. Anyone outside the
 * list gets a "not authorized" screen even on a successful Google
 * sign-in.
 */

import { useEffect, useState } from 'react';
import {
  browserLocalPersistence,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { getFirebaseApp } from '@/features/travel/firebase';

/** Lowercased emails allowed past the auth gate. Add new collaborators
 *  here. Casing on the comparison is normalised to lowercase. */
export const ALLOWED_EMAILS: ReadonlySet<string> = new Set([
  'shubh.jagani@gmail.com',
  'shalmipat@gmail.com',
]);

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  return ALLOWED_EMAILS.has(email.toLowerCase());
}

let authInstance: Auth | null = null;

function getAuthInstance(): Auth | null {
  if (authInstance) return authInstance;
  const app = getFirebaseApp();
  if (!app) return null;
  authInstance = getAuth(app);
  /* Force IndexedDB persistence (browserLocalPersistence). Firebase
     defaults to this on most browsers but falls back silently when
     the env looks ITP-strict (Safari, third-party-cookies disabled),
     which makes onAuthStateChanged hang on the very first load. Pin
     it explicitly so the auth state resolves quickly even when the
     env is tight. */
  void setPersistence(authInstance, browserLocalPersistence).catch((err) => {
    console.warn('[firebase-auth] setPersistence failed', err);
  });
  return authInstance;
}

/** Build a Google provider tuned for an account-picker flow.
 *  Centralised so popup + redirect paths stay in sync. */
function googleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  /* Force account picker every time so a wrong-account sign-in is
     easy to undo without a deep "remove account" flow. */
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

/** Errors signInWithPopup throws when the OS / browser blocks the
 *  popup or the user dismisses the implicit-new-tab fallback. When we
 *  see one of these we kick off a same-tab redirect instead. */
const POPUP_FALLBACK_CODES: ReadonlySet<string> = new Set([
  'auth/popup-blocked',
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
]);

function shouldFallbackToRedirect(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' && POPUP_FALLBACK_CODES.has(code);
}

export async function signInWithGoogle(): Promise<User | null> {
  const auth = getAuthInstance();
  if (!auth) {
    console.warn('[firebase-auth] Firebase not configured — sign-in skipped.');
    return null;
  }
  try {
    /* Try popup first — fastest happy-path on Chrome / Edge desktop
       where popups are allowed. Returns immediately on success and
       avoids losing the page state to a redirect. */
    const cred = await signInWithPopup(auth, googleProvider());
    return cred.user;
  } catch (err) {
    if (shouldFallbackToRedirect(err)) {
      /* Popup blocked (common on Safari, locked-down Chrome profiles,
         or anywhere third-party cookies are off). Switch to redirect
         — this navigates the whole tab to Google's consent screen and
         bounces back; getRedirectResult on next load picks up the
         credential and onAuthStateChanged fires. */
      console.warn('[firebase-auth] popup blocked, falling back to redirect', err);
      await signInWithRedirect(auth, googleProvider());
      /* Page is navigating away — the promise never resolves locally.
         Return null so callers stop the spinner; the redirect flow
         completes after the round-trip. */
      return null;
    }
    console.warn('[firebase-auth] sign-in failed', err);
    throw err;
  }
}

export async function signOutFirebase(): Promise<void> {
  const auth = getAuthInstance();
  if (!auth) return;
  try {
    await signOut(auth);
  } catch (err) {
    console.warn('[firebase-auth] sign-out failed', err);
  }
}

export type AuthState =
  /** Auth state still resolving on first load. */
  | { status: 'loading' }
  /** Firebase isn't configured at all — bypass the gate (dev fallback). */
  | { status: 'bypassed' }
  /** No user signed in. */
  | { status: 'signed-out' }
  /** Signed in, email not on the allow-list. */
  | { status: 'not-authorized'; email: string }
  /** Signed in and allowed — render the app. */
  | { status: 'authorized'; user: User };

/** Dev-only bypass: set VITE_BYPASS_AUTH=1 in `.env.local` to skip
 *  the Firebase auth gate entirely (lets you load the app at
 *  localhost:5173 without signing in). Tree-shaken out of prod builds
 *  via the `import.meta.env.DEV` guard. */
function isDevAuthBypassed(): boolean {
  if (!import.meta.env.DEV) return false;
  const flag = import.meta.env.VITE_BYPASS_AUTH;
  return flag === '1' || flag === 'true';
}

/** React hook over Firebase Auth's onAuthStateChanged with the
 *  allow-list applied. Suitable for top-level gate components. */
export function useFirebaseUser(): AuthState {
  const [state, setState] = useState<AuthState>(() => {
    if (isDevAuthBypassed()) return { status: 'bypassed' };
    const auth = getAuthInstance();
    if (!auth) return { status: 'bypassed' };
    return { status: 'loading' };
  });

  useEffect(() => {
    if (isDevAuthBypassed()) return;
    const auth = getAuthInstance();
    if (!auth) return;
    /* Drain any pending redirect result first — when the user lands
       back here after signInWithRedirect, Firebase needs this call
       to consume the URL hash, create the credential and fire
       onAuthStateChanged. Without it the gate sits at "Checking
       sign-in…" indefinitely on the redirect return trip. */
    getRedirectResult(auth).catch((err) => {
      console.warn('[firebase-auth] getRedirectResult failed', err);
    });
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setState({ status: 'signed-out' });
        return;
      }
      if (!isEmailAllowed(user.email)) {
        setState({ status: 'not-authorized', email: user.email ?? '(no email)' });
        return;
      }
      setState({ status: 'authorized', user });
    });
    return unsub;
  }, []);

  return state;
}
