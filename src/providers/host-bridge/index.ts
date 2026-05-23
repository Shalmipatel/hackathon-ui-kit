/**
 * Public exports for the host-bridge package.
 *
 * Feature code should import from `@/providers/host-bridge` (the core) or
 * from a specific facade like `@/providers/host-bridge/features/auth`.
 * Don't import from `./types` or `./core` directly.
 */

export { hostBridge, type HostBridge } from './core';
export {
  BridgeError,
  BridgeErrorCodes,
  BRIDGE_PROTOCOL_VERSION,
  type BridgeErrorCode,
  type HostInfo,
  type HostPlatform,
  type NortonAgentBridgeNative,
  type RequestOptions,
  type SafeAreaInsets,
} from './types';
export { authBridge, type AuthBridge } from './features/auth';
export {
  permissionsBridge,
  type PermissionsBridge,
  type PermissionType,
  type PermissionStatus,
} from './features/permissions';
export { downloadBridge, saveBlob, type DownloadBridge } from './features/download';
export { browserBridge, type BrowserBridge } from './features/browser';
export {
  pushBridge,
  type PushBridge,
  type PushPermission,
  type PushStatusResult,
} from './features/push';
export { navigationBridge, type NavigationBridge } from './features/navigation';
export { useHostInfo, type HostInfoSnapshot } from './useHostInfo';
export { usePermission, type UsePermissionResult } from './usePermission';
