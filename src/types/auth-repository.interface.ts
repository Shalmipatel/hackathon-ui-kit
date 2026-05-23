import type { AuthState, AuthStrategyConfig } from './auth';

export interface AuthCheckOptions {
  skipCache?: boolean;
}

export interface IAuthRepository {
  readonly strategy: AuthStrategyConfig;
  getAuthState(options?: AuthCheckOptions): Promise<AuthState>;
  getAccessToken(): Promise<string>;
  signOut(): Promise<void>;
}
