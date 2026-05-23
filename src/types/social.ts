export interface SocialAccount {
  accountId: string;
  name: string | null;
  avatar: string | null;
  status: unknown | null;
}

export interface SocialPlatform {
  id: string;
  name: string;
  description: string;
  scope: string;
  connectMethod: 'oauth2' | 'app_password' | 'bot_token';
  capabilities: {
    posting: string[];
    analytics: boolean | 'limited';
    inbox: { dms: boolean; comments: boolean; reviews: boolean };
    scheduling: boolean;
    webhooks: string[];
  };
  contentLimits: {
    characterLimit: number | null;
    maxImages: number | null;
    maxVideos: number | null;
  };
  accounts: SocialAccount[];
}
