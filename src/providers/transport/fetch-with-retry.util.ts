/**
 * Retry-aware fetch utilities for web-native services.
 *
 * Ported 1:1 from the extension's retry.ts -- zero Chrome dependencies.
 * Used by Connection (ping with retry) and available for
 * any service that needs resilient HTTP requests.
 */

export interface RetryConfig {
  maxAttempts?: number;
  maxDurationMs?: number;
  intervalMs: number;
  requestTimeoutMs?: number;
  useRetryAfterFromResponse?: boolean;
  isRetryable: (status: number) => boolean;
  abortSignal?: AbortSignal;
  onAttempt?: (attempt: number) => void;
}

export interface RetryResult {
  ok: boolean;
  status: number;
  body?: string;
  reason?: 'exhausted' | 'non_retryable' | 'aborted' | 'timeout';
}

export interface StreamRetryResult {
  ok: boolean;
  status: number;
  response?: Response;
  body?: string;
  reason?: 'exhausted' | 'non_retryable' | 'aborted' | 'timeout';
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  config: RetryConfig,
): Promise<RetryResult> {
  const startMs = Date.now();
  let attempt = 0;

  while (true) {
    if (config.abortSignal?.aborted) {
      return { ok: false, status: 0, reason: 'aborted' };
    }

    attempt++;
    config.onAttempt?.(attempt);

    if (config.maxAttempts && attempt > config.maxAttempts) {
      return { ok: false, status: 0, reason: 'exhausted' };
    }

    if (config.maxDurationMs && Date.now() - startMs >= config.maxDurationMs) {
      return { ok: false, status: 0, reason: 'timeout' };
    }

    let status = 0;
    let body = '';

    try {
      const perRequestController = new AbortController();
      let requestTimer: ReturnType<typeof setTimeout> | undefined;

      if (config.requestTimeoutMs) {
        requestTimer = setTimeout(() => perRequestController.abort(), config.requestTimeoutMs);
      }

      const onParentAbort = () => perRequestController.abort();
      config.abortSignal?.addEventListener('abort', onParentAbort, { once: true });

      try {
        const response = await fetch(url, { ...init, signal: perRequestController.signal });
        if (requestTimer) clearTimeout(requestTimer);
        config.abortSignal?.removeEventListener('abort', onParentAbort);

        status = response.status;
        body = await response.text();
      } catch (err) {
        if (requestTimer) clearTimeout(requestTimer);
        config.abortSignal?.removeEventListener('abort', onParentAbort);

        if (err instanceof DOMException && err.name === 'AbortError') {
          if (config.abortSignal?.aborted) {
            return { ok: false, status: 0, reason: 'aborted' };
          }
          status = 0;
          body = 'Request timeout';
        } else {
          status = 0;
          body = err instanceof Error ? err.message : 'Network error';
        }
      }
    } catch (err) {
      status = 0;
      body = err instanceof Error ? err.message : 'Unknown error';
    }

    if (status >= 200 && status < 300) {
      return { ok: true, status, body };
    }

    if (status > 0 && !config.isRetryable(status)) {
      return { ok: false, status, body, reason: 'non_retryable' };
    }

    const hasAttemptsLeft = !config.maxAttempts || attempt < config.maxAttempts;
    const hasTimeLeft = !config.maxDurationMs || Date.now() - startMs < config.maxDurationMs;

    if (!hasAttemptsLeft || !hasTimeLeft) {
      return { ok: false, status, body, reason: 'exhausted' };
    }

    let waitMs = config.intervalMs;
    if (config.useRetryAfterFromResponse && body) {
      try {
        const parsed = JSON.parse(body);
        if (typeof parsed.retryAfterSeconds === 'number' && parsed.retryAfterSeconds > 0) {
          waitMs = parsed.retryAfterSeconds * 1000;
        }
      } catch {
        /* use default interval */
      }
    }

    try {
      await sleep(waitMs, config.abortSignal);
    } catch {
      return { ok: false, status: 0, reason: 'aborted' };
    }
  }
}

/**
 * Retry-aware fetch for streaming responses.
 * Returns the raw Response on success so callers can consume the body
 * incrementally via response.body.getReader().
 */
export async function fetchStreamWithRetry(
  url: string,
  init: RequestInit,
  config: RetryConfig,
): Promise<StreamRetryResult> {
  const startMs = Date.now();
  let attempt = 0;
  let lastStatus = 0;
  let lastBody = '';

  while (true) {
    if (config.abortSignal?.aborted) {
      return { ok: false, status: 0, reason: 'aborted' };
    }

    attempt++;
    config.onAttempt?.(attempt);

    if (config.maxAttempts && attempt > config.maxAttempts) {
      return { ok: false, status: lastStatus, body: lastBody, reason: 'exhausted' };
    }

    if (config.maxDurationMs && Date.now() - startMs >= config.maxDurationMs) {
      return { ok: false, status: lastStatus, body: lastBody, reason: 'timeout' };
    }

    try {
      const perRequestController = new AbortController();
      let requestTimer: ReturnType<typeof setTimeout> | undefined;

      if (config.requestTimeoutMs) {
        requestTimer = setTimeout(() => perRequestController.abort(), config.requestTimeoutMs);
      }

      const onParentAbort = () => perRequestController.abort();
      config.abortSignal?.addEventListener('abort', onParentAbort, { once: true });

      try {
        const response = await fetch(url, { ...init, signal: perRequestController.signal });
        if (requestTimer) clearTimeout(requestTimer);

        config.abortSignal?.removeEventListener('abort', onParentAbort);

        if (response.ok) {
          return { ok: true, status: response.status, response };
        }
        lastStatus = response.status;
        lastBody = await response.text().catch(() => '');

        if (!config.isRetryable(response.status)) {
          return { ok: false, status: lastStatus, body: lastBody, reason: 'non_retryable' };
        }
      } catch (err) {
        if (requestTimer) clearTimeout(requestTimer);
        config.abortSignal?.removeEventListener('abort', onParentAbort);

        if (err instanceof DOMException && err.name === 'AbortError') {
          if (config.abortSignal?.aborted) {
            return { ok: false, status: 0, reason: 'aborted' };
          }
          lastStatus = 0;
          lastBody = 'Request timeout';
        } else {
          lastStatus = 0;
          lastBody = err instanceof Error ? err.message : 'Network error';
        }
      }
    } catch (err) {
      lastStatus = 0;
      lastBody = err instanceof Error ? err.message : 'Unknown error';
    }

    const hasAttemptsLeft = !config.maxAttempts || attempt < config.maxAttempts;
    const hasTimeLeft = !config.maxDurationMs || Date.now() - startMs < config.maxDurationMs;

    if (!hasAttemptsLeft || !hasTimeLeft) {
      return { ok: false, status: lastStatus, body: lastBody, reason: 'exhausted' };
    }

    let waitMs = config.intervalMs;
    if (config.useRetryAfterFromResponse && lastBody) {
      try {
        const parsed = JSON.parse(lastBody);
        if (typeof parsed.retryAfterSeconds === 'number' && parsed.retryAfterSeconds > 0) {
          waitMs = parsed.retryAfterSeconds * 1000;
        }
      } catch {
        /* use default interval */
      }
    }

    try {
      await sleep(waitMs, config.abortSignal);
    } catch {
      return { ok: false, status: 0, reason: 'aborted' };
    }
  }
}
