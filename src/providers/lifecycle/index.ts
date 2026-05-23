/**
 * Lifecycle refresh — public facade.
 *
 * Bootstrap calls `initLifecycle()` once during app startup and
 * `disposeLifecycle()` during teardown. Feature code subscribes to
 * resume events by calling `getRefreshCoordinator().onRefresh(...)`
 * (e.g. a "Refresh" button or smoke testing).
 */

import { RefreshCoordinator } from './refresh-coordinator';
import { VisibilitySource } from './visibility-source';
import type { IRefreshCoordinator } from '@/core/interfaces/lifecycle.interface';

let coordinator: IRefreshCoordinator | null = null;

export function initLifecycle(): IRefreshCoordinator {
  // Idempotent — safe under HMR and double-invocation guards in bootstrap.
  if (coordinator) return coordinator;
  coordinator = new RefreshCoordinator({
    sources: [new VisibilitySource()],
  });
  return coordinator;
}

export function getRefreshCoordinator(): IRefreshCoordinator {
  if (!coordinator) {
    throw new Error('[lifecycle] Not initialized; call initLifecycle() in bootstrap');
  }
  return coordinator;
}

export function disposeLifecycle(): void {
  coordinator?.dispose();
  coordinator = null;
}

export type {
  LifecycleEvent,
  LifecycleSource,
  ILifecycleSource,
  IRefreshCoordinator,
  RefreshListenerOptions,
} from '@/core/interfaces/lifecycle.interface';
