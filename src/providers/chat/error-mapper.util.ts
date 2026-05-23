/**
 * Error message mapping for user-friendly error display.
 */

export const ERROR_MESSAGES = {
  EXTENSION_DISCONNECTED: 'Connection to extension lost',
  TOKEN_FAILED: 'Failed to get access token',
  RESPONSE_FAILED: 'Response failed',
  NETWORK_ERROR: 'Network error - please check your connection and try again',
  UNKNOWN_ERROR: 'Unknown error',
  TIMEOUT_ERROR: 'Timeout waiting for LLM response',
  UNAVAILABLE:
    'The assistant is temporarily unavailable — the backend may be restarting to apply configuration changes. Please try again in a moment.',
} as const;

/**
 * Map raw error messages to user-friendly strings.
 */
export function mapStreamError(rawError: string): string {
  if (!rawError) return ERROR_MESSAGES.UNKNOWN_ERROR;

  const lowerError = rawError.toLowerCase();

  if (lowerError.includes('network') || rawError === 'Failed to fetch' || rawError === 'Load failed') {
    return ERROR_MESSAGES.NETWORK_ERROR;
  }

  if (lowerError.includes('timeout')) {
    return ERROR_MESSAGES.TIMEOUT_ERROR;
  }

  if (lowerError.includes('token') || lowerError.includes('auth')) {
    return ERROR_MESSAGES.TOKEN_FAILED;
  }

  return rawError;
}
