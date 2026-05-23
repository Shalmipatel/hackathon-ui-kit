/**
 * Add-to-Home-Screen state — shared between the bottom banner and the
 * sidebar nav item.
 *
 * Flow on mobile iOS Safari:
 *   1. Page loads → banner appears at the bottom
 *   2. User taps the × on the banner → bannerDismissed = true → banner
 *      disappears AND a prominent "Add app" nav item appears in the sidebar
 *   3. User taps the banner OR the sidebar item → overlayOpen = true
 *      → instruction overlay (with animated demo) is shown
 *   4. User closes the overlay → it disappears, banner stays dismissed
 *      until the next page load
 */

import { create } from 'zustand';

function isIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua))
  );
}

function isSafari(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

/** Eligibility is computed once at module load. */
const ELIGIBLE = typeof window !== 'undefined' && isIOS() && isSafari() && !isStandalone();

interface A2HSState {
  /** Is this a mobile iOS Safari user who hasn't installed the PWA yet? */
  eligible: boolean;
  /** User explicitly closed the bottom banner this session. */
  bannerDismissed: boolean;
  /** Instruction overlay (animated demo) is currently displayed. */
  overlayOpen: boolean;

  dismissBanner: () => void;
  openOverlay: () => void;
  closeOverlay: () => void;
}

export const useA2HSStore = create<A2HSState>()((set) => ({
  eligible: ELIGIBLE,
  bannerDismissed: false,
  overlayOpen: false,

  dismissBanner: () => set({ bannerDismissed: true }),
  // Opening the overlay implicitly hides the banner so the two don't stack
  openOverlay: () => set({ overlayOpen: true, bannerDismissed: true }),
  closeOverlay: () => set({ overlayOpen: false }),
}));
