/**
 * Social accounts client.
 *
 * Implements ISocialClient via ExternalTransport targeting whichever
 * social-accounts API your backend exposes. In dev, the Vite proxy
 * handles CORS; in production, your gateway proxies the call.
 */

import type { ISocialClient, SocialPlatform } from '@/types';
import type { ExternalTransport } from '@/providers/transport/external-transport';
import { EXTERNAL_ENDPOINTS } from '@/providers/transport/external-transport';

export class SocialClient implements ISocialClient {
  constructor(private transport: ExternalTransport) {}

  async listPlatforms(signal?: AbortSignal): Promise<SocialPlatform[]> {
    const resp = await this.transport.request(
      EXTERNAL_ENDPOINTS.SOCIAL.ACCOUNTS,
      { signal },
    );
    const data = await resp.json();
    return (data.platforms ?? data) as SocialPlatform[];
  }

  async getConnectUrl(platformId: string, signal?: AbortSignal): Promise<string> {
    const resp = await this.transport.request(
      `${EXTERNAL_ENDPOINTS.SOCIAL.CONNECT}/${platformId}`,
      { signal },
    );
    const data = await resp.json();
    const payload = data.data ?? data;
    return (payload.authUrl ?? payload.url) as string;
  }

  async disconnect(accountId: string, signal?: AbortSignal): Promise<void> {
    await this.transport.request(
      `${EXTERNAL_ENDPOINTS.SOCIAL.ACCOUNTS}/${accountId}`,
      { method: 'DELETE', signal },
    );
  }
}
