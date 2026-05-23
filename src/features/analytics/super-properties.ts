/**
 * Super properties — context that rides every event automatically.
 *
 * The four-context model (see analytics tracking plan §2):
 *   app_shell        — `web` | `ios_native` | `android_native`
 *   is_native_host   — true when running inside the Norton Agent wrapper
 *   viewport_class   — `mobile_web` | `desktop_web`  (≤768px wide)
 *   is_mobile_form_factor — viewport ≤768 OR is_native_host
 *
 * Once these are registered, every event is sliceable by shell × viewport
 * without touching individual emit sites.
 *
 * Call `initSuperProperties()` exactly once at app boot. It also wires a
 * matchMedia listener that keeps `viewport_class` and `is_mobile_form_factor`
 * in sync on resize (e.g. user rotates a tablet).
 */

import { getNortonAgent, isMobileHost } from '@/features/connections/host-bridge';
import {
  registerSuperProperties,
  updateSuperProperty,
} from './analytics';
import {
  EVENTS,
  track,
  ANALYTICS_CONTRACT_VERSION,
  type AppShell,
  type Surface,
  type ViewportClass,
} from './events';

const MOBILE_BREAKPOINT_PX = 768;

function detectAppShell(): AppShell {
  const agent = getNortonAgent();
  if (!agent) return 'web';
  if (agent.platform === 'ios') return 'ios_native';
  if (agent.platform === 'android') return 'android_native';
  return 'web';
}

function detectViewportClass(): ViewportClass {
  if (typeof window === 'undefined') return 'desktop_web';
  return window.innerWidth <= MOBILE_BREAKPOINT_PX ? 'mobile_web' : 'desktop_web';
}

function detectAppEnvironment(): 'local' | 'staging' | 'prod' {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'local';
    if (host.includes('test') || host.includes('staging') || host.includes('dev'))
      return 'staging';
  }
  if (import.meta.env.MODE === 'development') return 'local';
  if (import.meta.env.MODE === 'test') return 'staging';
  return 'prod';
}

/**
 * Set the static super-property block at app boot. Idempotent — safe to
 * call multiple times.
 *
 * `surface` is NOT set here — it updates over time and is managed by
 * `setCurrentSurface`.
 */
export function initSuperProperties(appVersion: string): void {
  const appShell = detectAppShell();
  const isNativeHost = isMobileHost();
  const viewportClass = detectViewportClass();
  const isMobileFormFactor = viewportClass === 'mobile_web' || isNativeHost;

  registerSuperProperties({
    app_version: appVersion,
    app_environment: detectAppEnvironment(),
    app_shell: appShell,
    is_native_host: isNativeHost,
    viewport_class: viewportClass,
    is_mobile_form_factor: isMobileFormFactor,
    /* Schema version for the event taxonomy itself. Bumped via
     * ANALYTICS_CONTRACT_VERSION in events.ts when the contract changes
     * in a way that affects cross-version comparisons. Dashboards
     * spanning a bump should filter on this property to avoid mixing
     * cohorts on different schema versions. */
    analytics_contract_version: ANALYTICS_CONTRACT_VERSION,
  });

  /* analytics tracking plan §3 Group 12 — `Native Bridge Detected` fires once
   * at boot when running inside the Norton Agent shell. The list of
   * bridge methods present is captured so we can detect contract drift
   * (e.g., shell rolls back a method we expected). */
  if (isNativeHost) {
    const agent = getNortonAgent();
    if (agent) {
      const knownMethods = ['openIntegrationAuth', 'onIntegrationDone'] as const;
      const bridgeMethods = knownMethods.filter(
        (m) => typeof (agent as unknown as Record<string, unknown>)[m] === 'function',
      );
      track(EVENTS.NATIVE_BRIDGE_DETECTED, {
        bridge_platform: agent.platform,
        bridge_methods: bridgeMethods,
      });
    }
  }

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`);
    mql.addEventListener('change', e => {
      const next: ViewportClass = e.matches ? 'mobile_web' : 'desktop_web';
      registerSuperProperties({
        viewport_class: next,
        is_mobile_form_factor: next === 'mobile_web' || isMobileHost(),
      });
    });
  }
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Mutable super properties — call from the relevant domain code.        */
/* ────────────────────────────────────────────────────────────────────── */

/** Update the `surface` super property on tab/screen change. Also drives  *  the `previous_surface` field on `Surface Viewed` (caller's responsibility). */
export function setCurrentSurface(surface: Surface): void {
  updateSuperProperty('surface', surface);
}
