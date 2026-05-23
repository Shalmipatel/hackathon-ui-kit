/**
 * Google OAuth → OpenClaw gog skill integration.
 *
 * Flow:
 *  1. User enters their Gmail address and clicks Connect.
 *  2. We generate a CSRF state token, stash it + the email in
 *     localStorage (sessionStorage doesn't reliably propagate to
 *     popups across all browsers), and open a Google OAuth popup.
 *  3. Popup goes through Google consent, then Google redirects back
 *     to http://localhost:5173/oauth/google/callback?code=...&state=...
 *  4. index.tsx detects the callback path BEFORE booting the React
 *     tree, runs handleOAuthCallback() which:
 *       - validates the state against the stashed value,
 *       - POSTs {code, state, email, redirectUri} to
 *         /api/gog/auth/complete (proxied to the OpenClaw server),
 *       - postMessage's success/failure back to the opener,
 *       - closes the popup.
 *  5. The opener resolves the connect() promise, persists the
 *     connected email, surfaces a toast.
 *
 * Why not exchange the code client-side: the spec says the server
 * runs `gog auth add <email> --remote --step 2 --auth-url ... --redirect-uri ...`,
 * which calls into Google itself with the client secret. The client
 * secret can't ship to the browser.
 */

const CLIENT_ID =
  '775904840598-iu85tvlej2suq1op7tbr2qvv3db8hpcd.apps.googleusercontent.com';

/* Must EXACTLY match an authorized redirect URI on the Google OAuth
   client — user has both http://localhost:5173 and the callback path
   registered. Using the path so the app shell doesn't re-mount on the
   main window if a user somehow lands here directly. */
const REDIRECT_URI =
  typeof window !== 'undefined'
    ? `${window.location.origin}/oauth/google/callback`
    : 'http://localhost:5173/oauth/google/callback';

const AUTH_URI = 'https://accounts.google.com/o/oauth2/auth';

/* Scopes the gog skill needs. Order doesn't matter for Google but
   is preserved here so the consent screen reads cleanly. */
const SCOPES = [
  'email',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.settings.basic',
  'https://www.googleapis.com/auth/gmail.settings.sharing',
  'https://www.googleapis.com/auth/userinfo.email',
  'openid',
].join(' ');

const STATE_KEY = 'gog-oauth-state';
const PENDING_EMAIL_KEY = 'gog-oauth-pending-email';
const CONNECTED_EMAIL_KEY = 'gog-connected-email';
const POSTMESSAGE_TYPE = 'gog-oauth-result';
export const OAUTH_CALLBACK_PATH = '/oauth/google/callback';

interface ConnectResult {
  success: boolean;
  email?: string;
  error?: string;
}

interface PostMessageBody extends ConnectResult {
  type: typeof POSTMESSAGE_TYPE;
}

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function buildOAuthUrl(state: string, loginHint: string): string {
  const params = new URLSearchParams({
    access_type: 'offline',
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    include_granted_scopes: 'true',
    state,
    /* Force the consent screen even for previously-authorized accounts
       so we always come back with a refresh_token (Google only issues
       one on first consent unless prompt=consent is set). */
    prompt: 'consent',
    /* Suggest the email the user typed so they don't have to pick from
       Google's account chooser. */
    login_hint: loginHint,
  });
  return `${AUTH_URI}?${params}`;
}

/** Kick off a Connect-Gmail OAuth flow. Resolves once the popup
 *  finishes (success), the user closes it (error: "Popup closed"),
 *  or the popup gets blocked (error: "Popup blocked"). */
export function connectGmail(email: string): Promise<ConnectResult> {
  return new Promise((resolve) => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      resolve({ success: false, error: 'Enter a valid email address.' });
      return;
    }
    const trimmedEmail = email.trim();
    const state = randomState();
    try {
      localStorage.setItem(STATE_KEY, state);
      localStorage.setItem(PENDING_EMAIL_KEY, trimmedEmail);
    } catch {
      /* localStorage blocked (private mode, etc.) — proceed; the
         callback handler will surface a clearer error than us trying
         to read from a broken storage. */
    }

    const url = buildOAuthUrl(state, trimmedEmail);
    const popup = window.open(url, 'gog-oauth', 'width=520,height=720');
    if (!popup) {
      resolve({ success: false, error: 'Popup blocked — allow popups for this site and try again.' });
      return;
    }

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as PostMessageBody | undefined;
      if (!data || data.type !== POSTMESSAGE_TYPE) return;
      cleanup();
      resolve({ success: data.success, email: data.email, error: data.error });
    };

    let resolved = false;
    const cleanup = () => {
      if (resolved) return;
      resolved = true;
      window.removeEventListener('message', onMessage);
      clearInterval(closedPoll);
    };

    /* If the user closes the popup without completing, postMessage
       never fires — poll for closure so the promise resolves cleanly. */
    const closedPoll = window.setInterval(() => {
      if (popup.closed) {
        cleanup();
        resolve({ success: false, error: 'Popup closed before sign-in completed.' });
      }
    }, 500);

    window.addEventListener('message', onMessage);
  });
}

/** Called from the popup window when Google redirects back. Validates
 *  state, posts {code, email} to the server endpoint that runs gog,
 *  notifies the opener, then closes the popup. */
export async function handleOAuthCallback(): Promise<void> {
  const result: ConnectResult = await runCallback();
  /* Notify whoever opened us. Fall back to writing the result to
     localStorage so a parent that's polling can still observe it. */
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(
        { type: POSTMESSAGE_TYPE, ...result } as PostMessageBody,
        window.location.origin,
      );
    }
  } catch {
    /* Cross-window postMessage can throw if opener is on a
       different origin (shouldn't happen here, but be defensive). */
  }
  /* Brief visible status before closing so a fast network doesn't
     flash the page blank. */
  setStatus(result.success ? 'Gmail connected — closing…' : `Failed: ${result.error ?? 'unknown'}`);
  setTimeout(() => {
    try {
      window.close();
    } catch {
      /* If closing is blocked (e.g. opened as a top-level tab), at
         least navigate back to the app root. */
      window.location.replace('/');
    }
  }, 600);
}

async function runCallback(): Promise<ConnectResult> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');

  if (error) return { success: false, error: `Google: ${error}` };
  if (!code) return { success: false, error: 'No auth code in callback.' };
  if (!state) return { success: false, error: 'No state in callback.' };

  let storedState: string | null = null;
  let pendingEmail: string | null = null;
  try {
    storedState = localStorage.getItem(STATE_KEY);
    pendingEmail = localStorage.getItem(PENDING_EMAIL_KEY);
    /* One-shot — clear so a back-button replay can't re-submit. */
    localStorage.removeItem(STATE_KEY);
    localStorage.removeItem(PENDING_EMAIL_KEY);
  } catch {
    return { success: false, error: 'Local storage unavailable in callback.' };
  }
  if (storedState !== state) {
    return { success: false, error: 'State mismatch (possible CSRF) — try again.' };
  }
  if (!pendingEmail) {
    return { success: false, error: 'Missing email — restart the flow.' };
  }

  /* Reconstruct the full callback URL gog expects so the server can
     hand it straight to `gog auth add ... --auth-url ...`. */
  const fullAuthUrl = `${window.location.origin}${window.location.pathname}${window.location.search}`;

  try {
    const resp = await fetch('/api/gog/auth/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        code,
        state,
        email: pendingEmail,
        redirectUri: REDIRECT_URI,
        authUrl: fullAuthUrl,
      }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      return {
        success: false,
        error: `Server returned ${resp.status}${body ? ` — ${body.slice(0, 240)}` : ''}`,
      };
    }
    /* Persist the connected email so the UI can render "Connected as …"
       on the next render and survive reloads. */
    try {
      localStorage.setItem(CONNECTED_EMAIL_KEY, pendingEmail);
    } catch { /* non-fatal */ }
    return { success: true, email: pendingEmail };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function setStatus(text: string) {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('oauth-status');
  if (el) el.textContent = text;
}

export function getConnectedGmail(): string | null {
  try {
    return localStorage.getItem(CONNECTED_EMAIL_KEY);
  } catch {
    return null;
  }
}

export function disconnectGmail(): void {
  try {
    localStorage.removeItem(CONNECTED_EMAIL_KEY);
  } catch {
    /* non-fatal */
  }
  /* TODO when the backend exposes it: hit `/api/gog/auth/remove`
     so the server-side gog account also goes away. */
}
