/**
 * Generic host-bridge facade — the single entry point web code uses to talk
 * to the native shell. When running in a browser (no native host), every
 * method is a no-op or returns a sensible default, so feature code can call
 * the bridge unconditionally and branch on `hostBridge.isNative()` only when
 * platform behaviour actually differs.
 *
 * The native shell injects `window.__nortonAgent` synchronously at
 * `documentStart`, before any page script runs. By the time React mounts,
 * the bridge is already there — no async readiness handshake required.
 */

import {
  BridgeError,
  BridgeErrorCodes,
  type HostInfo,
  type HostPlatform,
  type NortonAgentBridgeNative,
  type RequestOptions,
} from './types';

function getNative(): NortonAgentBridgeNative | null {
  if (typeof window === 'undefined') return null;
  const agent = window.__nortonAgent;
  if (!agent || agent.__installed !== true) return null;
  return agent;
}

function isNative(): boolean {
  return getNative() !== null;
}

function platform(): HostPlatform | 'web' {
  const native = getNative();
  return native ? native.platform : 'web';
}

function info(): HostInfo | null {
  return getNative()?.host ?? null;
}

function supports(method: string): boolean {
  return getNative()?.supports(method) ?? false;
}

async function request<TParams extends object, TResult>(
  method: string,
  params?: TParams,
  options?: RequestOptions,
): Promise<TResult> {
  const native = getNative();
  if (!native) {
    throw new BridgeError(
      BridgeErrorCodes.METHOD_NOT_FOUND,
      `Bridge method '${method}' is unavailable: not running inside a native host`,
    );
  }
  try {
    return await native.request<TParams, TResult>(method, params, options);
  } catch (raw) {
    // Native shim throws its own BridgeError. Re-wrap to ensure we always
    // return an instance of *this* module's BridgeError (cross-realm safety).
    if (raw instanceof Error && (raw as { code?: string }).code) {
      const e = raw as Error & { code?: string; data?: unknown };
      throw new BridgeError(
        e.code ?? BridgeErrorCodes.INTERNAL_ERROR,
        e.message,
        e.data,
      );
    }
    throw raw;
  }
}

function subscribe<TPayload>(
  topic: string,
  handler: (payload: TPayload) => void,
): () => void {
  const native = getNative();
  if (!native) return () => undefined;
  return native.subscribe(topic, handler);
}

export const hostBridge = {
  isNative,
  platform,
  info,
  supports,
  request,
  subscribe,
};

export type HostBridge = typeof hostBridge;
