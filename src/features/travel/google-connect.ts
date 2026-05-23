/**
 * Google OAuth → OpenClaw gog skill integration.
 *
 * gog is a CLI tool installed on the OpenClaw server, exposed as a
 * skill the agent can invoke from chat. There is no REST endpoint
 * to POST the auth code to — instead we ask the agent to run the
 * `gog auth add --remote --step 2` command via the chat session.
 *
 * Flow:
 *  1. User enters their Gmail address and clicks Connect.
 *  2. We generate a CSRF state token, stash it + the email in
 *     localStorage, and open a Google OAuth popup.
 *  3. Popup → Google consent → redirect back to http://localhost:5173
 *     (the bare origin matches what the user registered on the
 *     OAuth client).
 *  4. index.tsx detects the callback (code + state in query + state
 *     matches our stashed value) BEFORE booting the React tree,
 *     runs handleOAuthCallback() which postMessages
 *     { code, state, email, authUrl } back to the opener and closes.
 *  5. The opener (connectGmail) builds the gog command string and
 *     sends it as a chat message — the agent invokes the gog skill,
 *     runs the command, and reports back in the chat. We mark the
 *     email as connected optimistically since the user can verify
 *     in the chat transcript.
 */

const CLIENT_ID =
  '775904840598-iu85tvlej2suq1op7tbr2qvv3db8hpcd.apps.googleusercontent.com';

/* Must EXACTLY match an authorized redirect URI on the Google OAuth
   client. The user registered the bare origin (http://localhost:5173)
   so we use that — Google does string-equality on this value, so any
   trailing path / slash would fail with redirect_uri_mismatch. The
   callback is detected in index.tsx by sniffing query params for
   `code` + `state` + a matching localStorage CSRF token. */
const REDIRECT_URI =
  typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';

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

/** True when this page load is the Google OAuth redirect landing —
 *  query has both `code` and `state`, AND the state matches a
 *  pending value we wrote before opening the popup. The state-match
 *  guard prevents a user who lands on the app with random `?code=` in
 *  the URL from being treated as a callback. */
export function isOAuthCallback(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  const state = params.get('state');
  if (!state || !params.get('code')) return false;
  try {
    return localStorage.getItem(STATE_KEY) === state;
  } catch {
    return false;
  }
}

interface ConnectResult {
  success: boolean;
  email?: string;
  error?: string;
  /** Available when success === true — fields the opener uses to
   *  build the gog command it asks the agent to run. */
  code?: string;
  state?: string;
  authUrl?: string;
  redirectUri?: string;
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
      /* Forward EVERY field — the caller needs code / state / authUrl
         / redirectUri to build the gog chat command. Dropping them
         here is what caused the bogus "Connection failed" after a
         genuinely successful popup. */
      const { type: _t, ...rest } = data;
      void _t;
      resolve(rest);
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

  /* Reconstruct the full callback URL gog's --auth-url flag expects. */
  const fullAuthUrl = `${window.location.origin}${window.location.pathname}${window.location.search}`;

  /* gog is a CLI skill on the OpenClaw server, not a REST endpoint —
     return the params to the opener, which sends the actual gog
     command to the agent via chat. */
  return {
    success: true,
    email: pendingEmail,
    code,
    state,
    authUrl: fullAuthUrl,
    redirectUri: REDIRECT_URI,
  };
}

/** The chat prompt that asks the agent to run the gog auth command.
 *  Wraps the command in a strict "execute, don't interpret" frame so
 *  the agent's default "Gmail isn't connected" template can't fire. */
export function buildGogCommandPrompt(args: {
  email: string;
  authUrl: string;
  redirectUri: string;
}): string {
  /* Shell-escape values via single quotes — gog runs server-side so
     we don't have to worry about Windows quoting. */
  const sq = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
  const cmd =
    `gog auth add ${sq(args.email)} --remote --step 2 ` +
    `--auth-url ${sq(args.authUrl)} ` +
    `--redirect-uri ${sq(args.redirectUri)} ` +
    `--services gmail`;
  return [
    'Execute this gog CLI command EXACTLY as written, using the gog skill installed on this OpenClaw instance. This command IS the Gmail authentication step — do NOT ask me to connect Gmail, do NOT prompt me to log in, just run it.',
    '',
    '```bash',
    cmd,
    '```',
    '',
    `When the command finishes, report the stdout / stderr verbatim so I can confirm. If it succeeds the account ${args.email} is now linked for gmail.`,
  ].join('\n');
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
