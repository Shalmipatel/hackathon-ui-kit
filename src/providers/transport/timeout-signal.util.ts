/**
 * Combines an internal timeout AbortController with an optional external signal.
 * Returns a merged signal that aborts on either timeout or external abort,
 * plus a cleanup function to clear the timer.
 */
export function withTimeout(
  timeoutMs: number,
  externalSignal?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();

  if (externalSignal?.aborted) {
    controller.abort();
    return { signal: controller.signal, cleanup: () => {} };
  }

  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    },
  };
}
