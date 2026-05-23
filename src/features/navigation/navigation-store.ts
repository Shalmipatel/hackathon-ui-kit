/**
 * App-level navigation store — lets any code (host-bridge, DevConsole,
 * in-app triggers) request a screen transition without coupling to
 * TabPage's local state.
 *
 * Producer writes a pending intent, TabPage consumes it on the next
 * render and dispatches the actual view switch + any side-effects
 * (session load, etc.).
 */

import { create } from 'zustand';

export type NavigationTarget =
  | { type: 'home' }
  | { type: 'chat'; sessionId: string };

interface NavigationState {
  pending: NavigationTarget | null;

  goToHome: () => void;
  goToChat: (sessionId: string) => void;

  /** Atomically read-and-clear the pending navigation. */
  consume: () => NavigationTarget | null;
}

export const useNavigationStore = create<NavigationState>()((set, get) => ({
  pending: null,

  goToHome: () => set({ pending: { type: 'home' } }),

  goToChat: (sessionId) =>
    set({ pending: { type: 'chat', sessionId } }),

  consume: () => {
    const nav = get().pending;
    if (nav) set({ pending: null });
    return nav;
  },
}));
