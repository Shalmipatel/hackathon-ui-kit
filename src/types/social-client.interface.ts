import type { SocialPlatform } from './social';

export interface ISocialClient {
  listPlatforms(signal?: AbortSignal): Promise<SocialPlatform[]>;
  getConnectUrl(platformId: string, signal?: AbortSignal): Promise<string>;
  disconnect(accountId: string, signal?: AbortSignal): Promise<void>;
}
