export interface ConnectedAccount {
  accountId: string;
  email: string;
  isConnected: boolean;
}

export interface IntegrationService {
  key: string;
  name: string;
  description: string;
  accounts: ConnectedAccount[];
}

export interface GoogleAccessToken {
  accountId: string;
  email: string;
  accessToken: string;
  accessTokenExpiresAt: string;
  scopes: string[];
  provider: string;
}
