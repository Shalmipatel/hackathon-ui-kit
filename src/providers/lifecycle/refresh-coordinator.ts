/**
 * RefreshCoordinator — central hub between lifecycle sources and feature
 * listeners. Implements:
 *
 *   - Source fan-in (any number of `ILifecycleSource` instances).
 *   - Hidden-duration computation (single owner; sources just signal "I'm back").
 *   - Global debounce (separate window for `force: true` manual triggers).
 *   - Re-entrancy queue (events that arrive while a dispatch is in flight are
 *     drained FIFO without re-debouncing — D4).
 *   - Per-listener throttle (`minHiddenMs`, `minIntervalMs`); bypassed when
 *     `force: true` (correctness predicates are NOT bypassed — D10).
 *   - Per-listener inflight skip (D6) — no abort plumbing.
 *   - Defensive listener cap (D7) and id-collision dev-warn (D5).
 *
 * See `docs/lifecycle-refresh-docs/plan.md` §4.3 for the full rationale per
 * decision number.
 */

import type {
  IRefreshCoordinator,
  ILifecycleSource,
  LifecycleEvent,
  RefreshListenerOptions,
} from '@/core/interfaces/lifecycle.interface';

const DEFAULT_DEBOUNCE_MS = 500;
const DEFAULT_FORCE_DEBOUNCE_MS = 250;
const DEFAULT_MAX_LISTENERS = 256;
const LOG = '[RefreshCoordinator]';

interface Listener {
  readonly id: string;
  readonly callback: (event: LifecycleEvent) => void | Promise<void>;
  readonly minHiddenMs: number;
  readonly minIntervalMs: number;
  readonly predicate?: (event: LifecycleEvent) => boolean;
  lastFiredAt: number;
  inflight: Promise<unknown> | null;
}

export interface RefreshCoordinatorConfig {
  readonly sources: readonly ILifecycleSource[];
  readonly debounceMs?: number;
  readonly forceDebounceMs?: number;
  readonly maxListeners?: number;
}

export class RefreshCoordinator implements IRefreshCoordinator {
  private readonly listeners = new Map<string, Listener>();
  private readonly queue: LifecycleEvent[] = [];
  private lastHiddenAt: number | null = null;
  private lastIngestAt = 0;
  private dispatching = false;
  private autoIdCounter = 0;
  private disposed = false;

  constructor(private readonly config: RefreshCoordinatorConfig) {
    for (const source of config.sources) {
      source.start((event) => this.ingest(event));
    }
  }

  register(
    callback: Listener['callback'],
    options: RefreshListenerOptions = {},
  ): () => void {
    if (this.disposed) {
      console.warn(`${LOG} register() after dispose; ignored`);
      return () => undefined;
    }

    const cap = this.config.maxListeners ?? DEFAULT_MAX_LISTENERS;
    if (this.listeners.size >= cap) {
      console.error(`${LOG} MAX_LISTENERS=${cap} exceeded; refusing id="${options.id ?? '<auto>'}"`);
      return () => undefined;
    }

    const id = options.id ?? `auto-${++this.autoIdCounter}`;
    if (this.listeners.has(id)) {
      console.warn(`${LOG} listener id="${id}" already registered; overriding (last-write-wins)`);
    }

    const listener: Listener = {
      id,
      callback,
      minHiddenMs: options.minHiddenMs ?? 0,
      minIntervalMs: options.minIntervalMs ?? 0,
      predicate: options.predicate,
      lastFiredAt: 0,
      inflight: null,
    };
    this.listeners.set(id, listener);

    return () => {
      // Only remove if still the same listener instance (guards against
      // stale unsubscribes after an id-collision override).
      if (this.listeners.get(id) === listener) this.listeners.delete(id);
    };
  }

  trigger(reason: string, options: { force?: boolean } = {}): void {
    this.ingest({
      source: 'manual',
      reason,
      occurredAt: Date.now(),
      hiddenDurationMs: 0,
      force: options.force,
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const source of this.config.sources) {
      try {
        source.stop();
      } catch (err) {
        console.warn(`${LOG} source "${source.name}" stop() threw:`, err);
      }
    }
    this.listeners.clear();
    this.queue.length = 0;
  }

  private ingest(event: LifecycleEvent): void {
    if (this.disposed) return;

    // Hidden events are state-only — they update lastHiddenAt and never fan
    // out. Foreground/bfcache-restore/manual/network/native are dispatched.
    if (event.source === 'visibility' && event.reason === 'hidden') {
      this.lastHiddenAt = event.occurredAt;
      return;
    }

    // D1: coordinator owns hiddenDurationMs.
    const hiddenDurationMs = this.lastHiddenAt ? event.occurredAt - this.lastHiddenAt : 0;
    const enriched: LifecycleEvent = { ...event, hiddenDurationMs };
    this.lastHiddenAt = null;

    // Re-entrancy: queue if mid-dispatch (D4).
    if (this.dispatching) {
      this.queue.push(enriched);
      return;
    }

    // D3: `force: true` uses smaller debounce window to defeat button-spam,
    // but still defends against accidental double-clicks.
    const debounceMs = enriched.force
      ? (this.config.forceDebounceMs ?? DEFAULT_FORCE_DEBOUNCE_MS)
      : (this.config.debounceMs ?? DEFAULT_DEBOUNCE_MS);
    if (enriched.occurredAt - this.lastIngestAt < debounceMs) return;
    this.lastIngestAt = enriched.occurredAt;

    this.runDispatch(enriched);
  }

  private runDispatch(event: LifecycleEvent): void {
    this.dispatching = true;
    try {
      this.dispatch(event);
    } finally {
      this.dispatching = false;
      // D4: drained queue items are accepted; don't re-debounce.
      const next = this.queue.shift();
      if (next) this.runDispatch(next);
    }
  }

  private dispatch(event: LifecycleEvent): void {
    const now = event.occurredAt;
    for (const listener of this.listeners.values()) {
      // Throttle gates apply only to non-forced events.
      if (!event.force) {
        if (event.hiddenDurationMs < listener.minHiddenMs) continue;
        if (now - listener.lastFiredAt < listener.minIntervalMs) continue;
      }

      // Predicates are correctness gates — applied even on `force: true`.
      if (listener.predicate && !listener.predicate(event)) continue;

      // D6: skip if previous callback for this listener is still in flight.
      if (listener.inflight) continue;

      listener.lastFiredAt = now;
      try {
        const result = listener.callback(event);
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          const pending = result as Promise<unknown>;
          listener.inflight = pending;
          pending.then(
            () => {
              if (listener.inflight === pending) listener.inflight = null;
            },
            (err: unknown) => {
              if (listener.inflight === pending) listener.inflight = null;
              console.warn(`${LOG} listener "${listener.id}" rejected:`, err);
            },
          );
        }
      } catch (err) {
        console.warn(`${LOG} listener "${listener.id}" threw:`, err);
      }
    }
  }
}
