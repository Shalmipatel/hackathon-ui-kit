export type AuthStrategyName = 'neo_auth' | 'oauth_cookie';

export type AuthStrategyConfig =
  | { type: 'neo_auth' }
  | { type: 'oauth_cookie'; loginUrl: string };

export interface AuthState {
  isLoggedIn: boolean;
  strategy?: AuthStrategyName;
  displayName?: string;
  email?: string;
  sub?: string;
  picture?: string;
  role?: 'owner' | 'partner';
}

export const DEFAULT_AUTH_STATE: AuthState = {
  isLoggedIn: false,
};
