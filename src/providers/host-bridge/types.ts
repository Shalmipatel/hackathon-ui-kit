/**
 * Public types for the generic host-bridge.
 *
 * Mirrors `feature/webapp/.../bridge/core/HostInfo.kt` and `BridgeMessage.kt`
 * on the native side. Keep them in sync — the wire format is versioned via
 * `BRIDGE_PROTOCOL_VERSION`, which is enforced on both ends.
 */

export const BRIDGE_PROTOCOL_VERSION = 1;

export type HostPlatform = 'ios' | 'android';

export interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface HostInfo {
  platform: HostPlatform;
  appVersion: string;
  bridgeVersion: number;
  locale: string;
  safeAreaInsets: SafeAreaInsets;
}

export interface RequestOptions {
  /** Override the default 30 s request timeout. Pass `0` to disable. */
  timeoutMs?: number;
}

/** Error thrown by the bridge when a request fails or times out. */
export class BridgeError extends Error {
  readonly code: string;
  readonly data?: unknown;
  constructor(code: string, message: string, data?: unknown) {
    super(message);
    this.name = 'BridgeError';
    this.code = code;
    this.data = data;
  }
}

/**
 * Well-known error codes emitted by the native side. Feature handlers may
 * also throw codes outside this list — surface those as-is.
 */
export const BridgeErrorCodes = {
  METHOD_NOT_FOUND: 'method_not_found',
  INVALID_PARAMS: 'invalid_params',
  PERMISSION_DENIED: 'permission_denied',
  USER_CANCELLED: 'user_cancelled',
  VERSION_MISMATCH: 'version_mismatch',
  INTERNAL_ERROR: 'internal_error',
  TIMEOUT: 'timeout',
} as const;
export type BridgeErrorCode = (typeof BridgeErrorCodes)[keyof typeof BridgeErrorCodes];

/**
 * Shape of `window.__nortonAgent` after the native shell injects it. Code
 * that needs to interact with the native shell should go through the
 * facades in `./features/*` rather than touching this directly.
 */
export interface NortonAgentBridgeNative {
  __installed: true;
  __deliver: (msg: unknown) => void;
  __setCapabilities: (list: readonly string[]) => void;
  platform: HostPlatform;
  host: HostInfo;
  capabilities: readonly string[];
  request: <TParams extends object, TResult>(
    method: string,
    params?: TParams,
    options?: RequestOptions,
  ) => Promise<TResult>;
  subscribe: <TPayload>(
    topic: string,
    handler: (payload: TPayload) => void,
  ) => () => void;
  supports: (method: string) => boolean;
  BridgeError: typeof BridgeError;

  // ------- Legacy back-compat surface (do not call from new code) -------
  openIntegrationAuth: (url: string) => void;
  onIntegrationDone?: () => void;
  openExternalUrl?: (url: string) => void;
}
