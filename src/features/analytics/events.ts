/**
 * Canonical event taxonomy. Single source of truth.
 *
 * Always reference event names via the `EVENTS` const, never with raw
 * string literals. Event-name typos and casing drift are otherwise silent
 * — most analytics backends will happily ingest `'chat opened'` next to
 * `'Chat Opened'` and fragment your funnels.
 *
 * Property shapes are typed via `EventPropMap` and enforced by `track()`.
 * When you add an event, add an entry to BOTH `EVENTS` and `EventPropMap`.
 */

import { trackEvent } from './analytics';

/* ────────────────────────────────────────────────────────────────────── */
/*  Event names                                                            */
/* ────────────────────────────────────────────────────────────────────── */

export const EVENTS = {
  // ── Group 1: Auth & Lifecycle ──────────────────────────────────────
  AUTH_STARTED: 'Auth Started',
  AUTH_COMPLETED: 'Auth Completed',
  AUTH_FAILED: 'Auth Failed',
  SIGNED_OUT: 'Signed Out',
  SESSION_STARTED: 'Session Started',

  // ── Group 3: Connections ───────────────────────────────────────────
  CONNECTION_BROWSER_OPENED: 'Connection Browser Opened',
  CONNECTION_SELECTED: 'Connection Selected',
  CONNECTION_OAUTH_STARTED: 'Connection OAuth Started',
  CONNECTION_OAUTH_COMPLETED: 'Connection OAuth Completed',
  CONNECTION_OAUTH_FAILED: 'Connection OAuth Failed',
  CONNECTION_ADDED: 'Connection Added',
  CONNECTION_SYNC_STARTED: 'Connection Sync Started',
  CONNECTION_SYNC_COMPLETED: 'Connection Sync Completed',
  CONNECTION_SYNC_FAILED: 'Connection Sync Failed',
  CONNECTION_REMOVED: 'Connection Removed',

  // ── Group 7: Chat / Notifications ──────────────────────────────────
  CHAT_OPENED: 'Chat Opened',
  CHAT_MESSAGE_SENT: 'Chat Message Sent',
  CHAT_MESSAGE_RECEIVED: 'Chat Message Received',
  NOTIFICATION_OPENED: 'Notification Opened',
  NOTIFICATION_PERMISSION_REQUESTED: 'Notification Permission Requested',
  NOTIFICATION_PERMISSION_CHANGED: 'Notification Permission Changed',
  PUSH_BANNER_SHOWN: 'Push Banner Shown',
  PUSH_BANNER_CTA_TAPPED: 'Push Banner CTA Tapped',
  PUSH_BANNER_DISMISSED: 'Push Banner Dismissed',

  // ── Group 8: Settings & Preferences ────────────────────────────────
  SETTINGS_OPENED: 'Settings Opened',
  PREFERENCES_SAVED: 'Preferences Saved',
  TIMEZONE_CHANGED: 'Timezone Changed',
  ACCOUNT_DELETED: 'Account Deleted',

  // ── Group 9: Surface / Navigation ──────────────────────────────────
  SURFACE_VIEWED: 'Surface Viewed',

  // ── Group 10: Errors & Empty States ────────────────────────────────
  ERROR_SURFACED: 'Error Surfaced',
  EMPTY_STATE_SHOWN: 'Empty State Shown',
  LOADING_STATE_EXCEEDED: 'Loading State Exceeded',

  // ── Group 11: Failure Modes & Dead Ends ────────────────────────────
  ACTION_FAILED: 'Action Failed',
  FORM_VALIDATION_FAILED: 'Form Validation Failed',
  RETRY_ATTEMPTED: 'Retry Attempted',
  SEARCH_PERFORMED: 'Search Performed',
  FILTER_RETURNED_EMPTY: 'Filter Returned Empty',
  HELP_OPENED: 'Help Opened',
  COMING_SOON_TAPPED: 'Coming Soon Tapped',
  FEEDBACK_SUBMITTED: 'Feedback Submitted',
  CONNECTION_PERMISSION_DENIED: 'Connection Permission Denied',
  CONNECTION_TOKEN_REFRESH_FAILED: 'Connection Token Refresh Failed',
  CONNECTION_NO_DATA_AVAILABLE: 'Connection No Data Available',
  SESSION_BOUNCED: 'Session Bounced',
  SURFACE_IDLE_EXIT: 'Surface Idle Exit',

  // ── Group 12: Native Shell Bridge ──────────────────────────────────
  NATIVE_BRIDGE_DETECTED: 'Native Bridge Detected',
  NATIVE_BRIDGE_CALLED: 'Native Bridge Called',
  NATIVE_BRIDGE_FAILED: 'Native Bridge Failed',
  EXTERNAL_BROWSER_OPENED: 'External Browser Opened',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

/**
 * Schema version for the event taxonomy as a whole. Stamped on
 * every event as the `analytics_contract_version` super-property.
 *
 * Bump when the contract changes in a way that affects how dashboards
 * should compare data across the boundary — adding a required property,
 * renaming a property, removing an event, changing the meaning of an
 * existing field. Don't bump for additive changes that are purely
 * optional (new optional property, new event name).
 *
 * Dashboards that span a bump should `filter analytics_contract_version =
 * 'X'` so cohorts on one side of the change aren't compared against
 * cohorts on the other side using a now-stale schema.
 *
 * The same string should also appear on any server-side analytics emit
 * that participates in the same contract.
 */
export const ANALYTICS_CONTRACT_VERSION = '1.0';

/* ────────────────────────────────────────────────────────────────────── */
/*  Property shapes — one entry per event in EVENTS.                       */
/*                                                                          */
/*  Use `EventProps<typeof EVENTS.X>` to grab the props for a single event. */
/*  `track()` enforces the right shape per call.                            */
/* ────────────────────────────────────────────────────────────────────── */

/**
 * Canonical surface enum. Matches the in-app `AppView` values plus the
 * non-tab pseudo-surfaces (`onboarding`, `auth`) we want to attribute
 * events to. Update both this and the `setCurrentSurface` super-property
 * effect in TabPage when adding a new top-level tab.
 */
export type Surface =
  | 'home'
  | 'chat'
  | 'settings'
  | 'security'
  | 'connections'
  | 'notifications'
  | 'onboarding'
  | 'auth';

export type AppShell = 'web' | 'ios_native' | 'android_native';
export type ViewportClass = 'mobile_web' | 'desktop_web';

export interface EventPropMap {
  // ── Group 1: Auth & Lifecycle ──────────────────────────────────────
  [EVENTS.AUTH_STARTED]: {
    auth_provider: string;
    entry_point: 'web' | 'mobile' | 'deep_link';
  };
  [EVENTS.AUTH_COMPLETED]: {
    auth_provider: string;
    is_new_user: boolean;
    time_in_oauth_ms?: number;
  };
  [EVENTS.AUTH_FAILED]: {
    auth_provider: string;
    error_code: string;
    failure_step: string;
  };
  [EVENTS.SIGNED_OUT]: { surface?: Surface };
  [EVENTS.SESSION_STARTED]: {
    is_returning_user: boolean;
    days_since_signup?: number;
    days_since_last_active?: number;
  };

  // ── Group 3: Connections ───────────────────────────────────────────
  [EVENTS.CONNECTION_BROWSER_OPENED]: { surface: Surface };
  [EVENTS.CONNECTION_SELECTED]: { platform: string; surface: Surface };
  [EVENTS.CONNECTION_OAUTH_STARTED]: { platform: string; surface: Surface };
  [EVENTS.CONNECTION_OAUTH_COMPLETED]: {
    platform: string;
    surface: Surface;
    time_in_oauth_ms?: number;
  };
  [EVENTS.CONNECTION_OAUTH_FAILED]: {
    platform: string;
    surface: Surface;
    error_code: string;
    failure_step: string;
  };
  [EVENTS.CONNECTION_ADDED]: {
    platform: string;
    source: 'onboarding' | 'settings';
    /** Snapshot of connections count after the add; optional during migration. */
    total_connections_after?: number;
    /** For Google integrations only — the OAuth-returned email address. */
    account_email?: string;
    /** For "other" custom-URL connections — the user-supplied URL. */
    url?: string;
  };
  [EVENTS.CONNECTION_SYNC_STARTED]: { platform: string };
  [EVENTS.CONNECTION_SYNC_COMPLETED]: {
    platform: string;
    items_imported?: number;
    time_to_sync_ms?: number;
  };
  [EVENTS.CONNECTION_SYNC_FAILED]: { platform: string; error_code: string };
  [EVENTS.CONNECTION_REMOVED]: {
    platform: string;
    /** Where the disconnect was triggered from. Use this OR `surface`; this
     *  matches existing `Platform Disconnected` data, while `surface` is
     *  the standardized super-property. */
    source?: 'onboarding' | 'settings';
    surface?: Surface;
    days_connected?: number;
    removal_reason?: string;
    /** For Google integrations only. */
    account_email?: string;
  };

  // ── Group 7: Chat / Notifications ──────────────────────────────────
  [EVENTS.CHAT_OPENED]: { unread_count_on_open: number };
  [EVENTS.CHAT_MESSAGE_SENT]: { message_length: number; has_attachment: boolean };
  [EVENTS.CHAT_MESSAGE_RECEIVED]: { message_type: string };
  [EVENTS.NOTIFICATION_OPENED]: {
    notification_type: string;
    notification_id: string;
    delivery_channel: 'in_app' | 'push_fcm' | 'email';
  };
  [EVENTS.NOTIFICATION_PERMISSION_REQUESTED]: { surface: Surface };
  [EVENTS.NOTIFICATION_PERMISSION_CHANGED]: {
    previous_state: 'granted' | 'denied' | 'default';
    new_state: 'granted' | 'denied' | 'default';
  };
  [EVENTS.PUSH_BANNER_SHOWN]: {
    permission: 'undetermined' | 'denied';
  };
  [EVENTS.PUSH_BANNER_CTA_TAPPED]: {
    permission: 'undetermined' | 'denied';
    cta_action: 'request_prompt' | 'open_settings';
  };
  [EVENTS.PUSH_BANNER_DISMISSED]: {
    permission: 'undetermined' | 'denied';
  };

  // ── Group 8: Settings & Preferences ────────────────────────────────
  [EVENTS.SETTINGS_OPENED]: { surface_from?: Surface };
  /** Existing `Preferences Saved` ships with per-platform shape from the
   *  ConnectionsView modal: platform, source, mode, has_attention, has_ignore.
   *  Generic-settings emit sites can also pass `fields_changed` instead. */
  [EVENTS.PREFERENCES_SAVED]: {
    platform?: string;
    source?: string;
    mode?: string;
    has_attention?: boolean;
    has_ignore?: boolean;
    fields_changed?: string[];
    notification_pref_changed?: boolean;
  };
  [EVENTS.TIMEZONE_CHANGED]: { from_tz: string; to_tz: string };
  [EVENTS.ACCOUNT_DELETED]: {
    connections_at_deletion: number;
    days_active: number;
  };

  // ── Group 9: Surface / Navigation ──────────────────────────────────
  [EVENTS.SURFACE_VIEWED]: {
    surface: Surface;
    previous_surface?: Surface;
    time_on_previous_surface_ms?: number;
  };

  // ── Group 10: Errors & Empty States ────────────────────────────────
  [EVENTS.ERROR_SURFACED]: {
    error_type: string;
    error_code: string;
    surface: Surface;
    is_recoverable: boolean;
  };
  [EVENTS.EMPTY_STATE_SHOWN]: { surface: Surface; empty_reason: string };
  [EVENTS.LOADING_STATE_EXCEEDED]: { surface: Surface; data_source: string };

  // ── Group 11: Failure Modes & Dead Ends ────────────────────────────
  [EVENTS.ACTION_FAILED]: {
    action_name: string;
    error_code: string;
    error_message?: string;
    surface: Surface;
    is_recoverable: boolean;
    attempt_number: number;
  };
  [EVENTS.FORM_VALIDATION_FAILED]: {
    form_name: string;
    field_errors: string[];
    surface: Surface;
  };
  [EVENTS.RETRY_ATTEMPTED]: {
    action_name: string;
    attempt_number: number;
    seconds_since_last_attempt: number;
  };
  [EVENTS.SEARCH_PERFORMED]: {
    query_length: number;
    result_count: number;
    surface: Surface;
  };
  [EVENTS.FILTER_RETURNED_EMPTY]: {
    surface: Surface;
    filter_type: string;
    filter_value: string;
  };
  [EVENTS.HELP_OPENED]: { surface: Surface; help_topic?: string };
  [EVENTS.COMING_SOON_TAPPED]: { feature_name: string; surface: Surface };
  [EVENTS.FEEDBACK_SUBMITTED]: {
    surface?: Surface;
    sentiment?: string;
    has_text: boolean;
  };
  [EVENTS.CONNECTION_PERMISSION_DENIED]: {
    platform: string;
    denied_scopes?: string[];
    surface: Surface;
  };
  [EVENTS.CONNECTION_TOKEN_REFRESH_FAILED]: { platform: string; error_code: string };
  [EVENTS.CONNECTION_NO_DATA_AVAILABLE]: {
    platform: string;
    lookback_window_days?: number;
  };
  [EVENTS.SESSION_BOUNCED]: {
    surface: Surface;
    seconds_in_session: number;
    entry_source?: string;
  };
  [EVENTS.SURFACE_IDLE_EXIT]: {
    surface: Surface;
    seconds_idle: number;
    next_surface?: Surface;
  };

  // ── Group 12: Native Shell Bridge ──────────────────────────────────
  /* `surface` is optional on these — bridge calls happen from deeply
   * nested code paths where threading the surface argument is fragile.
   * The `surface` super-property (set on tab change in TabPage) rides
   * every event automatically, so dashboards still get attribution. */
  [EVENTS.NATIVE_BRIDGE_DETECTED]: {
    bridge_platform: string;
    bridge_methods: string[];
  };
  [EVENTS.NATIVE_BRIDGE_CALLED]: { bridge_method: string; surface?: Surface };
  [EVENTS.NATIVE_BRIDGE_FAILED]: {
    bridge_method: string;
    error_code: string;
    surface?: Surface;
  };
  [EVENTS.EXTERNAL_BROWSER_OPENED]: {
    platform: string;
    target_host: string;
    surface?: Surface;
  };
}

export type EventProps<K extends EventName> = K extends keyof EventPropMap
  ? EventPropMap[K]
  : never;

/* ────────────────────────────────────────────────────────────────────── */
/*  Typed track() helper — use this from product code.                     */
/* ────────────────────────────────────────────────────────────────────── */

/**
 * Emit an analytics event with type-checked properties.
 *
 *   track(EVENTS.AUTH_COMPLETED, { auth_provider: 'google', is_new_user: true });
 *
 * The type system enforces that every property required by the event is
 * present and that no unknown props slip in. Super properties (set via
 * `super-properties.ts`) are expected to be added by your analytics SDK
 * automatically — don't include them per call.
 */
export function track<K extends EventName>(event: K, properties: EventProps<K>): void {
  trackEvent(event, properties as unknown as Record<string, unknown>);
}
