/**
 * PlatformEvents - Web-native SSE client for platform events.
 *
 * Replaces extension's PlatformSSEManager with direct fetch() + ReadableStream.
 * Connects to /api/neoclaw-platform/events?stream=true for real-time events:
 *   cron_run, browser_active, browser_idle, config_changed
 *
 * Capabilities (1:1 with extension's PlatformSSEManager):
 *   - SSE via fetch + ReadableStream (not EventSource -- needs Authorization header)
 *   - Backfill missed events on startup (JSON polling, no stream=true)
 *   - Exponential-backoff reconnection (1s base, 30s max)
 *   - Cron notification persistence via IStorageProvider
 *   - Dedup + cap at 200 notifications
 *   - Subscriber-based event dispatch
 *
 * Dropped (extension-only, N/A for web):
 *   - chrome.action badge → replaced by document.title prefix (notification-badge-listener)
 *   - Chrome OS notifications → replaced by Web Notification API (showWebNotification)
 *   - Port-based broadcasting
 */

import type { IAuthRepository, IStorageProvider } from '@/types';
import type { CronNotification } from '@/types';
import { GATEWAY_ENDPOINTS } from '@/providers/transport/gateway-endpoints';
import type { GatewayTransport } from '@/providers/transport/gateway-transport';
import { getDefaultConfig } from '@/features/app/config';

const STORAGE_KEYS = {
  NOTIFICATIONS: 'neoclaw_notifications',
  LAST_EVENT_TS: 'neoclaw_platform_last_event_ts',
} as const;

const MAX_NOTIFICATIONS = 200;
const FRESH_INSTALL_LIMIT = 50;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

export interface BrowserActiveEventData {
  toolCallId: string;
  sessionKey?: string;
}

export interface ConfigChangedEventData {
  path: string;
  reloadRequired: boolean;
}

export interface DataChangeEventData {
  action: string;
  table: string;
  changes: unknown;
  lastInsertRowid: number;
}

export interface PlatformEventHandler {
  onCronRun?: (data: CronNotification) => void;
  onBrowserActive?: (data: BrowserActiveEventData) => void;
  onBrowserIdle?: (data: BrowserActiveEventData) => void;
  onConfigChanged?: (data: ConfigChangedEventData) => void;
  onDataChange?: (data: DataChangeEventData) => void;
}

type PlatformEventType = 'cron_run' | 'browser_active' | 'browser_idle' | 'config_changed' | 'data_change';

interface PlatformEventPayload<T = unknown> {
  type: PlatformEventType;
  ts: number;
  data: T;
}

export class PlatformEvents {
  private controller: AbortController | null = null;
  private lastEventTimestamp = 0;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private running = false;
  private subscribers = new Set<PlatformEventHandler>();

  constructor(
    private gateway: GatewayTransport,
    private authProvider: IAuthRepository,
    private storageProvider: IStorageProvider,
  ) {}

  subscribe(handler: PlatformEventHandler): () => void {
    this.subscribers.add(handler);
    return () => {
      this.subscribers.delete(handler);
    };
  }

  async start(): Promise<void> {
    if (this.running) return;

    const isLoggedIn = await this.checkAuthStatus();
    if (!isLoggedIn) {
      console.log('[PlatformEvents] Cannot start - user not logged in');
      return;
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      const previous = Notification.permission;
      try {
        const { EVENTS, track, setUserProperties } = await import('@/features/analytics');
        track(EVENTS.NOTIFICATION_PERMISSION_REQUESTED, { surface: 'home' });
        Notification.requestPermission()
          .then((newState) => {
            track(EVENTS.NOTIFICATION_PERMISSION_CHANGED, {
              previous_state: previous,
              new_state: newState,
            });
            setUserProperties({ notification_permission: newState });
          })
          .catch(() => {});
      } catch {
        Notification.requestPermission().catch(() => {});
      }
    }

    this.running = true;
    this.reconnectAttempts = 0;

    // Load persisted timestamp
    const storedTs = await this.storageProvider.get<number>(STORAGE_KEYS.LAST_EVENT_TS, 0);
    this.lastEventTimestamp = storedTs;

    await this.backfillMissedEvents();
    this.connect();
  }

  stop(): void {
    this.running = false;

    if (this.controller) {
      this.controller.abort();
      this.controller = null;
    }

    this.clearReconnectTimeout();
    console.log('[PlatformEvents] Stopped');
  }

  isActive(): boolean {
    return this.running;
  }

  private async checkAuthStatus(): Promise<boolean> {
    try {
      const state = await this.authProvider.getAuthState();
      return state.isLoggedIn;
    } catch {
      return false;
    }
  }

  private async backfillMissedEvents(): Promise<void> {
    try {
      const { url: eventsUrl, init } = await this.gateway.prepareRequest(
        GATEWAY_ENDPOINTS.PLATFORM.EVENTS,
      );

      const since = this.lastEventTimestamp || 0;
      const limit = this.lastEventTimestamp ? MAX_NOTIFICATIONS : FRESH_INSTALL_LIMIT;

      const url = `${eventsUrl}?since=${since}&limit=${limit}`;

      const response = await fetch(url, init);
      if (!response.ok) {
        console.warn('[PlatformEvents] Backfill failed:', response.status);
        return;
      }

      const data = await response.json();
      if (!data.success || !data.events?.length) {
        console.log('[PlatformEvents] No events to backfill');
        return;
      }

      for (const event of data.events as PlatformEventPayload[]) {
        if (event.type === 'cron_run') {
          const notification = this.transformCronEvent(event.data as Record<string, unknown>);
          await this.persistNotification(notification);
        }
      }

      if (data.latestTimestamp) {
        this.lastEventTimestamp = data.latestTimestamp;
        await this.storageProvider.set(STORAGE_KEYS.LAST_EVENT_TS, data.latestTimestamp);
      }

      console.log(`[PlatformEvents] Backfilled ${data.events.length} events`);
    } catch (err) {
      console.error('[PlatformEvents] Backfill error:', err);
    }
  }

  private async connect(): Promise<void> {
    if (!this.running) return;

    try {
      this.controller = new AbortController();

      const { url: eventsUrl, init } = await this.gateway.prepareRequest(
        GATEWAY_ENDPOINTS.PLATFORM.EVENTS,
        { signal: this.controller.signal },
      );
      const url = `${eventsUrl}?stream=true`;

      console.log('[PlatformEvents] Connecting to:', url);

      const response = await fetch(url, init);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        console.error('[PlatformEvents] Connection failed:', {
          status: response.status,
          statusText: response.statusText,
          body: errorBody.slice(0, 200),
        });
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Response body is empty');
      }

      this.reconnectAttempts = 0;
      console.log('[PlatformEvents] Connected - streaming events');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (this.running) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('[PlatformEvents] Stream ended');
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        buffer = this.parseSSEBuffer(buffer);
      }

      reader.releaseLock();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        console.log('[PlatformEvents] Connection aborted');
        return;
      }
      console.error('[PlatformEvents] Connection error:', err);
    }

    if (this.running) {
      this.scheduleReconnect();
    }
  }

  private parseSSEBuffer(buffer: string): string {
    const lines = buffer.split('\n');
    let remaining = '';
    let currentEventType = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (i === lines.length - 1 && !buffer.endsWith('\n')) {
        remaining = line;
        continue;
      }

      if (!line) {
        currentEventType = '';
        continue;
      }

      if (line.startsWith(':')) {
        continue;
      }

      if (line.startsWith('event:')) {
        currentEventType = line.slice(6).trim();
        continue;
      }

      if (line.startsWith('data:')) {
        const data = line.slice(5).trim();
        this.handleEvent(currentEventType as PlatformEventType, data);
      }
    }

    return remaining;
  }

  private handleEvent(eventType: PlatformEventType, data: string): void {
    try {
      const parsed = JSON.parse(data) as PlatformEventPayload;

      if (parsed.ts > this.lastEventTimestamp) {
        this.lastEventTimestamp = parsed.ts;
        this.storageProvider.set(STORAGE_KEYS.LAST_EVENT_TS, parsed.ts);
      }

      switch (eventType) {
        case 'cron_run':
          this.handleCronEvent(parsed.data as Record<string, unknown>);
          break;
        case 'browser_active':
          this.dispatchToSubscribers('onBrowserActive', parsed.data as BrowserActiveEventData);
          break;
        case 'browser_idle':
          this.dispatchToSubscribers('onBrowserIdle', parsed.data as BrowserActiveEventData);
          break;
        case 'config_changed':
          this.dispatchToSubscribers('onConfigChanged', parsed.data as ConfigChangedEventData);
          break;
        case 'data_change':
          this.dispatchToSubscribers('onDataChange', parsed.data as DataChangeEventData);
          break;
        default:
          console.log(`[PlatformEvents] Unknown event type: ${eventType}`);
      }
    } catch (err) {
      console.error('[PlatformEvents] Failed to parse event:', err);
    }
  }

  private async handleCronEvent(data: Record<string, unknown>): Promise<void> {
    const notification = this.transformCronEvent(data);
    const { showCronNotifications } = getDefaultConfig().features;

    await this.persistNotification(notification);

    this.dispatchToSubscribers('onCronRun', notification);

    if (showCronNotifications) {
      this.showWebNotification(notification);
    }

    console.log(`[PlatformEvents] Cron event: ${notification.jobName} (${notification.status})`);
  }

  private showWebNotification(notification: CronNotification): void {
    if (
      typeof Notification === 'undefined' ||
      Notification.permission !== 'granted' ||
      document.visibilityState === 'visible'
    ) {
      return;
    }

    const title = notification.jobName || 'Task completed';
    const body = notification.summary
      ? notification.summary.length > 100
        ? notification.summary.slice(0, 100) + '...'
        : notification.summary
      : 'Scheduled task completed';

    try {
      const n = new Notification(title, {
        body,
        icon: '/icons/neo-claw.png',
        tag: notification.id,
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch {
      // Notification API may throw in insecure contexts
    }
  }

  private dispatchToSubscribers<K extends keyof PlatformEventHandler>(
    handlerKey: K,
    data: NonNullable<PlatformEventHandler[K]> extends (d: infer D) => void ? D : never,
  ): void {
    for (const subscriber of this.subscribers) {
      try {
        const handler = subscriber[handlerKey];
        if (typeof handler === 'function') {
          (handler as (d: typeof data) => void)(data);
        }
      } catch (err) {
        console.error(`[PlatformEvents] Subscriber error (${handlerKey}):`, err);
      }
    }
  }

  private transformCronEvent(raw: Record<string, unknown>): CronNotification {
    return {
      id: `${raw.jobId}-${raw.ts || Date.now()}`,
      ts: (raw.ts as number) || Date.now(),
      jobId: raw.jobId as string,
      jobName: (raw.jobName as string) || (raw.jobId as string),
      summary: (raw.summary as string) || '',
      fullResponse: raw.fullResponse as string | undefined,
      status: raw.status === 'failed' ? 'error' : 'ok',
      durationMs: (raw.durationMs as number) || 0,
      runAtMs: (raw.runAtMs as number) || (raw.startedAt as number) || 0,
      deliveryStatus: raw.deliveryStatus as string | undefined,
      sessionId: raw.sessionId as string | undefined,
      sessionKey: raw.sessionKey as string | undefined,
      model: raw.model as string | undefined,
      provider: raw.provider as string | undefined,
      usage: raw.usage as CronNotification['usage'],
    };
  }

  private async persistNotification(notification: CronNotification): Promise<void> {
    const existing = await this.storageProvider.get<CronNotification[]>(
      STORAGE_KEYS.NOTIFICATIONS,
      [],
    );

    if (existing.some((n) => n.id === notification.id)) {
      return;
    }

    const updated = [notification, ...existing].slice(0, MAX_NOTIFICATIONS);
    await this.storageProvider.set(STORAGE_KEYS.NOTIFICATIONS, updated);
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimeout();

    if (!this.running) return;

    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts),
      RECONNECT_MAX_MS,
    );
    this.reconnectAttempts++;

    console.log(
      `[PlatformEvents] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`,
    );

    this.reconnectTimeoutId = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
  }
}
