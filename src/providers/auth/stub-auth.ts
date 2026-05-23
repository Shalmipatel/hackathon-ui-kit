/**
 * StubAuthProvider — starter-kit stand-in for a real auth flow.
 *
 * The starter kit ships without any sign-in UI so you can boot straight
 * into the dashboard. This provider always reports the user as
 * "logged in" with a fake identity, so anything downstream that gates on
 * `authState.isLoggedIn` (chat, connections, settings) just proceeds.
 *
 * To wire real auth in your build:
 *   1. Implement IAuthRepository against your backend (JWT, cookie, OAuth — your call).
 *   2. Swap this provider out in `src/features/app/bootstrap/providers.ts`.
 *   3. Re-introduce a sign-in screen and gate the app shell on `isLoggedIn`.
 */

import type { AuthState, AuthStrategyConfig } from '@/types';
import type { AuthCheckOptions, IAuthRepository } from '@/types';

const STUB_USER: AuthState = {
  isLoggedIn: true,
  strategy: 'neo_auth',
  displayName: 'Demo User',
  email: 'demo@assistant.local',
  sub: 'stub-user',
};

export class StubAuthProvider implements IAuthRepository {
  readonly strategy: AuthStrategyConfig = { type: 'neo_auth' };

  async getAuthState(_options?: AuthCheckOptions): Promise<AuthState> {
    return STUB_USER;
  }

  async getAccessToken(): Promise<string> {
    return import.meta.env.VITE_NEOCLAW_API_KEY ?? '';
  }

  async signOut(): Promise<void> {
    /* no-op — stub provider has nothing to sign out of */
  }
}
