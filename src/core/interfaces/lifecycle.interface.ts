/**
 * Lifecycle refresh — domain contract.
 *
 * Frozen at V0. Anything in this file is the public surface every higher
 * layer (providers, features, bootstrap) compiles against. Concrete sources
 * (VisibilitySource, future NetworkSource, NativeLifecycleSource) and the
 * coordinator implementation live in `providers/lifecycle/`.
 *
 * See `docs/LIFECYCLE_REFRESH_STRATEGY.md` for the architectural model and
 * `docs/lifecycle-refresh-docs/plan.md` for the V0/V1 implementation plan.
 */

export type LifecycleSource = 'visibility' | 'manual' | 'network' | 'native';

export interface LifecycleEvent {
  readonly source: LifecycleSource;
  readonly reason: string;
  readonly occurredAt: number;
  readonly hiddenDurationMs: number;
  readonly force?: boolean;
}

export interface ILifecycleSource {
  readonly name: LifecycleSource;
  start(emit: (event: LifecycleEvent) => void): void;
  stop(): void;
}

export interface RefreshListenerOptions {
  readonly id?: string;
  readonly minHiddenMs?: number;
  readonly minIntervalMs?: number;
  /**
   * Caller-supplied predicate evaluated immediately before dispatch.
   * Returning `false` skips this listener for the current event without
   * affecting other listeners. Used for correctness gates (e.g. "not
   * currently streaming") — not throttling. Predicates run even when
   * `force: true`; throttle gates do not.
   */
  readonly predicate?: (event: LifecycleEvent) => boolean;
}

export interface IRefreshCoordinator {
  register(
    callback: (event: LifecycleEvent) => void | Promise<void>,
    options?: RefreshListenerOptions,
  ): () => void;
  trigger(reason: string, options?: { force?: boolean }): void;
  dispose(): void;
}
