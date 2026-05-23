/**
 * ClientEventsClient — thin, typed emitter for client→server events.
 *
 * Wraps GatewayTransport so credentials, agent-id, and fallback-ip headers
 * are inherited automatically. Uses `keepalive: true` so the request
 * survives navigation/unload (the modern replacement for sendBeacon when
 * you need a JSON body).
 *
 * Fire-and-forget: emit() never throws and returns void. The server's
 * 15-second ack timeout is the safety net if any individual emit fails.
 */

import type { GatewayTransport } from '@/providers/transport/gateway-transport';
import type { ClientEvent } from './types';

const ENDPOINT = '/api/neoclaw-platform/client-events';

export class ClientEventsClient {
  constructor(private readonly gateway: GatewayTransport) {}

  /**
   * Emit a typed client event. Fire-and-forget; never throws.
   * `occurredAt` is auto-stamped with Date.now() if not provided.
   */
  emit<E extends ClientEvent>(event: E): void {
    const envelope: E = {
      ...event,
      occurredAt: event.occurredAt || Date.now(),
    };

    void this.send(envelope).catch(() => {
      // Swallow — server timeout is the safety net.
    });
  }

  private async send(envelope: ClientEvent): Promise<void> {
    const body = JSON.stringify(envelope);

    const prepared = await this.gateway.prepareRequest(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    await fetch(prepared.url, {
      ...prepared.init,
      keepalive: true,
    });
  }
}
