/**
 * Sonner-style toast store.
 *
 * Usage:
 *   toast({ title: 'Saved' });
 *   toast({ title: 'Brief completed!', description: 'Field trip permission slip', action: { label: 'Undo', onClick: () => {...} } });
 *   toast.dismiss(id);
 *
 * Rendering is handled by <Toaster /> which reads from this store.
 *
 * Analytics: pass an `error` payload on toast input to fire
 * `Error Surfaced` (analytics tracking plan §3 Group 10) at the same moment
 * the toast renders. Non-error toasts stay completely untracked.
 */

import { create } from 'zustand';
import { trackErrorSurfaced } from '@/features/analytics';
import type { Surface } from '@/features/analytics';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

/** Optional payload that flips a toast into an error and fires
 *  `Error Surfaced`. Keep these separate from the visible toast
 *  contents so dashboards never receive verbatim error copy. */
export interface ToastErrorMeta {
  /** Required surface so dashboards can slice errors per screen. */
  surface: Surface;
  /** Short, dashboard-stable label, e.g. `gcal_sync_failed`. */
  error_type: string;
  /** Optional detailed code (defaults to `errorCodeOf(err)`). */
  error_code?: string;
  /** Original caught error if available — used to derive `error_code`. */
  err?: unknown;
  /** Whether the user has a path forward (retry, dismiss). Default true. */
  is_recoverable?: boolean;
}

export interface ToastData {
  id: string;
  title: string;
  description?: string;
  action?: ToastAction;
  /** Auto-dismiss timeout in ms. Default 3000. Set to 0 to disable. */
  duration?: number;
  /** Unix ms timestamp of when the toast was created. Used for ordering. */
  createdAt: number;
}

interface ToastState {
  toasts: ToastData[];
  push: (toast: Omit<ToastData, 'id' | 'createdAt'> & { id?: string; error?: ToastErrorMeta }) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

let idCounter = 0;
const nextId = () => `toast-${Date.now()}-${++idCounter}`;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  push: (t) => {
    const id = t.id ?? nextId();
    const toast: ToastData = {
      id,
      title: t.title,
      description: t.description,
      action: t.action,
      duration: t.duration ?? 3000,
      createdAt: Date.now(),
    };
    set((s) => ({ toasts: [...s.toasts, toast] }));
    if (t.error) {
      trackErrorSurfaced({
        error_type: t.error.error_type,
        error_code: t.error.error_code,
        err: t.error.err,
        surface: t.error.surface,
        is_recoverable: t.error.is_recoverable ?? true,
      });
    }
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

/* ──────────────────────────────────────────────────────────────────────
   Sonner-style public API
   ────────────────────────────────────────────────────────────────────── */

type ToastInput = Omit<ToastData, 'id' | 'createdAt'> & { id?: string; error?: ToastErrorMeta };

interface ToastApi {
  (input: ToastInput): string;
  dismiss: (id: string) => void;
  clear: () => void;
  /** Convenience wrapper: shows the toast AND fires `Error Surfaced`. */
  error: (input: Omit<ToastInput, 'error'> & { error: ToastErrorMeta }) => string;
}

export const toast: ToastApi = Object.assign(
  (input: ToastInput) => useToastStore.getState().push(input),
  {
    dismiss: (id: string) => useToastStore.getState().dismiss(id),
    clear: () => useToastStore.getState().clear(),
    error: (input: Omit<ToastInput, 'error'> & { error: ToastErrorMeta }) =>
      useToastStore.getState().push(input),
  },
);
