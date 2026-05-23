/**
 * Analytics shim — no-op by default.
 *
 * The starter kit ships without any analytics SDK wired up. Every product
 * call site (track, identifyAnalyticsUser, register super-properties, etc.)
 * goes through this surface so plugging in a real SDK later is a one-file
 * change: import the SDK here and forward each call through to it.
 *
 * Typical use:
 *   identifyAnalyticsUser({ id: authState.sub, email, name });
 *   trackEvent('Platform Connected', { platform: 'gmail', source: 'onboarding' });
 */

interface AnalyticsUser {
  id?: string;
  email?: string;
  name?: string;
}

/**
 * Tie the current browser to a real user. Hook your SDK's identify call
 * here. Safe to call on every render — implementations should be idempotent.
 */
export function identifyAnalyticsUser(_user: AnalyticsUser): void {
  /* no-op */
}

/**
 * Record a semantic event. Prefer the typed `track()` helper from
 * `events.ts` over this raw call — it enforces the canonical event-name
 * + property shape.
 */
export function trackEvent(_event: string, _properties?: Record<string, unknown>): void {
  /* no-op */
}

/**
 * Set super properties — context attached to every subsequent event by
 * a real SDK. Currently a no-op; wire your SDK's `register` here.
 */
export function registerSuperProperties(_props: Record<string, unknown>): void {
  /* no-op */
}

/**
 * Update a single super property — convenience wrapper around register
 * for the hot path of "user just navigated, update the surface".
 */
export function updateSuperProperty(key: string, value: unknown): void {
  registerSuperProperties({ [key]: value });
}

/**
 * Set per-user profile properties — overwrites existing values.
 */
export function setUserProperties(_props: Record<string, unknown>): void {
  /* no-op */
}

/**
 * Set per-user profile properties — only if not already present. Use for
 * write-once values like `signup_date` so re-identifying doesn't overwrite
 * the original timestamp.
 */
export function setUserPropertiesOnce(_props: Record<string, unknown>): void {
  /* no-op */
}

/**
 * Mark the current user's profile as deleted. Call after a successful
 * account-delete API response, before signing out.
 */
export function deleteUserProfile(): void {
  /* no-op */
}

/**
 * Apply the user's analytics opt-out preference. When `optedOut === true`
 * a real SDK should stop sending any events and persist the decision so
 * the preference survives reloads.
 */
export function applyAnalyticsOptOut(_optedOut: boolean): void {
  /* no-op */
}
