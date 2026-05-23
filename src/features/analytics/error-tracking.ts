import { EVENTS, track, type Surface } from './events';

export function errorCodeOf(err: unknown): string {
  if (err instanceof Error) return err.name || 'Error';
  if (typeof err === 'string') return 'string_error';
  if (err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string') {
    return (err as { code: string }).code;
  }
  return 'unknown';
}

function errorMessageOf(err: unknown): string | undefined {
  if (err instanceof Error) return err.message?.slice(0, 240);
  if (typeof err === 'string') return err.slice(0, 240);
  return undefined;
}

interface ActionFailedInput {
  action_name: string;
  err: unknown;
  surface: Surface;
  is_recoverable: boolean;
  attempt_number?: number;
}

/**
 * Fire `Action Failed`. Use from any catch block where the user kicked off
 * an action and it errored. Don't pre-stringify the error — pass the raw
 * `err` so `errorCodeOf` can pick the right shape.
 */
export function trackActionFailed({
  action_name,
  err,
  surface,
  is_recoverable,
  attempt_number = 1,
}: ActionFailedInput): void {
  track(EVENTS.ACTION_FAILED, {
    action_name,
    error_code: errorCodeOf(err),
    error_message: errorMessageOf(err),
    surface,
    is_recoverable,
    attempt_number,
  });
}

interface ErrorSurfacedInput {
  error_type: string;
  error_code?: string;
  err?: unknown;
  surface: Surface;
  is_recoverable: boolean;
}

/**
 * Fire `Error Surfaced`. Use when a user-visible error renders (banner,
 * toast, modal, inline form error) — distinct from `Action Failed` which
 * captures the *attempt* that errored. The same incident often fires
 * both; that's intentional (one captures the cause, the other captures
 * what the user saw).
 *
 * `error_code` defaults to the canonical code derived from `err` if you
 * pass one; otherwise pass an explicit string.
 */
export function trackErrorSurfaced({
  error_type,
  error_code,
  err,
  surface,
  is_recoverable,
}: ErrorSurfacedInput): void {
  track(EVENTS.ERROR_SURFACED, {
    error_type,
    error_code: error_code ?? (err !== undefined ? errorCodeOf(err) : 'unknown'),
    surface,
    is_recoverable,
  });
}
