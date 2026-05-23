const BACKEND_PREFIX = 'agent:main:';
const NEOCLAW_PREFIX = 'neoclaw-';
const FULL_PREFIX = `${BACKEND_PREFIX}${NEOCLAW_PREFIX}`;

/** Extract the client-side session ID from a backend session key, or null if not a neoclaw session. */
export function toClientKey(backendKey: string): string | null {
  return backendKey.startsWith(FULL_PREFIX)
    ? backendKey.slice(FULL_PREFIX.length)
    : null;
}

/** Build the full backend session key from a client-side session ID. */
export function toBackendKey(clientKey: string): string {
  return `${FULL_PREFIX}${clientKey}`;
}

/** Build the value for the `x-openclaw-session-key` header from a client-side session ID. */
export function toSessionKeyHeader(clientKey: string): string {
  return `${FULL_PREFIX}${clientKey}`;
}

/** True for neoclaw client sessions only. */
export function isUserSession(backendKey: string): boolean {
  return backendKey.startsWith(FULL_PREFIX);
}

