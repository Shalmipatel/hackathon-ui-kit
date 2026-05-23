/**
 * SessionClient -- shared HTTP client for /api/session/* endpoints.
 *
 * Used by both NeoAuthProvider and OAuthCookieAuthProvider.
 * Handles session validation, token-to-cookie exchange, and logout.
 * Caches the session response in-memory to avoid redundant /me calls.
 */

const SESSION_ME = '/api/session/me';
const SESSION_LOGIN = '/api/session/login';
const SESSION_LOGOUT = '/api/session/logout';
const SESSION_TOKEN = '/api/session/token';

const CACHE_TTL_MS = 60_000;
const TOKEN_EXPIRY_BUFFER_S = 60;

function parseJwt(token: string): Record<string, unknown> {
  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const payload = JSON.parse(atob(base64)) as Record<string, unknown>;
  return payload;
}

/**
 * Decode the `exp` field from a JWT payload and return it as a millisecond timestamp.
 */
function getTokenExpiry(token: string): number {
  const payload = parseJwt(token);
  return (payload.exp as number) * 1000;
}

export interface SessionInfo {
  email: string;
  name: string;
  picture?: string;
  sub: string;
  role?: 'owner' | 'partner';
}

export class SessionClient {
  private cachedSession: SessionInfo | null = null;
  private cacheTimestamp = 0;

  private cachedToken: string | null = null;
  private tokenCacheExpiry = 0;
  private tokenFetchPromise: Promise<string | null> | null = null;

  /**
   * Fetch current session from the gateway.
   * Returns cached result if fresh (< 60s old), otherwise hits the server.
   * Returns null when no valid session exists (401, network error).
   */
  async getSession(): Promise<SessionInfo | null> {
    if (this.cachedSession && Date.now() - this.cacheTimestamp < CACHE_TTL_MS) {
      return this.cachedSession;
    }

    try {
      const resp = await fetch(SESSION_ME, { credentials: 'include' });
      if (!resp.ok) {
        this.clearCache();
        return null;
      }

      const data = (await resp.json()) as SessionInfo;
      this.cachedSession = data;
      this.cacheTimestamp = Date.now();
      return data;
    } catch {
      this.clearCache();
      return null;
    }
  }

  /**
   * Exchange a raw JWT for an httpOnly session cookie.
   *
   * Sends POST /api/session/login with the JWT in the Authorization header.
   * The gateway validates the JWT, then responds with Set-Cookie.
   * After this call, subsequent requests with credentials:'include' carry the cookie.
   */
  async exchangeToken(bearerToken: string): Promise<boolean> {
    try {
      const resp = await fetch(SESSION_LOGIN, {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearerToken}` },
        credentials: 'include',
        redirect: 'manual',
      });

      if (resp.type === 'opaqueredirect' || resp.ok) {
        this.clearCache();
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Fetch a raw JWT from the gateway's /api/session/token endpoint.
   *
   * Result is cached in-memory until 60 seconds before the token's own `exp`
   * claim (or for 5 minutes when the token carries no `exp`).
   * Concurrent callers share a single in-flight request so the endpoint is
   * never hit more than once at a time.
   */
  async fetchToken(): Promise<string | null> {
    if (this.cachedToken && Date.now() < this.tokenCacheExpiry) {
      return this.cachedToken;
    }

    if (this.tokenFetchPromise) return this.tokenFetchPromise;

    this.tokenFetchPromise = this._doFetchToken().finally(() => {
      this.tokenFetchPromise = null;
    });

    return this.tokenFetchPromise;
  }

  private async _doFetchToken(): Promise<string | null> {
    try {
      const resp = await fetch(SESSION_TOKEN, { credentials: 'include' });
      if (!resp.ok) {
        this.cachedToken = null;
        this.tokenCacheExpiry = 0;
        return null;
      }

      const data = await resp.json();
      const token = (data.token as string) ?? null;

      if (token) {
        this.cachedToken = token;
        this.tokenCacheExpiry = getTokenExpiry(token) - TOKEN_EXPIRY_BUFFER_S * 1000;
      }

      return token;
    } catch {
      this.cachedToken = null;
      this.tokenCacheExpiry = 0;
      return null;
    }
  }

  /**
   * End the session -- clears the httpOnly cookie server-side and local cache.
   */
  async logout(): Promise<void> {
    this.clearCache();

    try {
      await fetch(SESSION_LOGOUT, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Best-effort: cookie may already be expired
    }
  }

  /** Clear the in-memory cache without a network call. */
  invalidateCache(): void {
    this.clearCache();
  }

  private clearCache(): void {
    this.cachedSession = null;
    this.cacheTimestamp = 0;
    this.cachedToken = null;
    this.tokenCacheExpiry = 0;
  }
}
