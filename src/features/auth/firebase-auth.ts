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
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
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
  return authInstance;
}

export async function signInWithGoogle(): Promise<User | null> {
  const auth = getAuthInstance();
  if (!auth) {
    console.warn('[firebase-auth] Firebase not configured — sign-in skipped.');
    return null;
  }
  const provider = new GoogleAuthProvider();
  /* Force account picker every time so a wrong-account sign-in is
     easy to undo without a deep "remove account" flow. */
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const cred = await signInWithPopup(auth, provider);
    return cred.user;
  } catch (err) {
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

/** React hook over Firebase Auth's onAuthStateChanged with the
 *  allow-list applied. Suitable for top-level gate components. */
export function useFirebaseUser(): AuthState {
  const [state, setState] = useState<AuthState>(() => {
    const auth = getAuthInstance();
    if (!auth) return { status: 'bypassed' };
    return { status: 'loading' };
  });

  useEffect(() => {
    const auth = getAuthInstance();
    if (!auth) return;
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
