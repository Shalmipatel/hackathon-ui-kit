/**
 * VisibilitySource — emits lifecycle events from `document.visibilitychange`
 * and `window.pageshow` (for Safari bfcache restores).
 *
 * Hidden transitions are emitted as `reason: 'hidden'` and consumed only by
 * the coordinator (state-only, never fanned out to listeners). Foreground and
 * bfcache-restore transitions are the actual "resume" signals.
 *
 * `hiddenDurationMs` is intentionally left at 0 here — the coordinator owns
 * the hidden-duration calculation (single source of truth, decision D1).
 */

import type { ILifecycleSource, LifecycleEvent } from '@/core/interfaces/lifecycle.interface';

export class VisibilitySource implements ILifecycleSource {
  readonly name = 'visibility' as const;

  private onVisibility: (() => void) | null = null;
  private onPageshow: ((event: PageTransitionEvent) => void) | null = null;

  start(emit: (event: LifecycleEvent) => void): void {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    this.onVisibility = () => {
      const reason = document.visibilityState === 'hidden' ? 'hidden' : 'foreground';
      emit({
        source: 'visibility',
        reason,
        occurredAt: Date.now(),
        hiddenDurationMs: 0,
      });
    };

    this.onPageshow = (event: PageTransitionEvent) => {
      // Only the bfcache-restore case is interesting; first-page-load is
      // already handled by app bootstrap.
      if (!event.persisted) return;
      emit({
        source: 'visibility',
        reason: 'bfcache-restore',
        occurredAt: Date.now(),
        hiddenDurationMs: 0,
      });
    };

    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pageshow', this.onPageshow);
  }

  stop(): void {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    if (this.onVisibility) document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.onPageshow) window.removeEventListener('pageshow', this.onPageshow);
    this.onVisibility = null;
    this.onPageshow = null;
  }
}
