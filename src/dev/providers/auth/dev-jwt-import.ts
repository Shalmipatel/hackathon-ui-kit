/**
 * dev-jwt-import — consume a JWT from a dev QR URL fragment.
 *
 * DEV-ONLY. Guarded by `import.meta.env.DEV` at both the call site
 * (src/index.tsx) and inside this module. In prod bundles this whole file
 * is tree-shaken out; see src/dev/README.md and
 * scripts/verify-no-dev-code.mjs for the hard guarantees.
 *
 * Flow:
 *   1. Desktop DevSettingsOverlay renders a QR encoding
 *        http://<lan-ip>:<port>/#dev-jwt=<jwt>&dev-auth=1
 *   2. Phone scans → lands on the app with that hash.
 *   3. This module runs BEFORE React mounts, extracts the JWT, installs
 *      it into localStorage, flips tokenAuthEnabled, scrubs the hash so
 *      it doesn't linger in history / copy-paste, then reloads so the
 *      NeoAuthProvider picks up the fresh storage on first render.
 *
 * Security notes:
 *   - URL fragments are never sent to the server (browsers strip them
 *     before hitting the wire), so the JWT does not appear in Vite's
 *     access logs or in any proxy.
 *   - We still scrub the hash on arrival so the JWT doesn't leak into
 *     browser history, the share sheet, or a casual "copy current URL".
 *   - Prod bundles don't contain this code; a user who pastes a
 *     malicious #dev-jwt= URL into a prod build gets nothing.
 */
import { DEV_JWT_KEY } from '@/providers/auth';
import { toast } from '@/features/toast';
import type { ExtensionSettings } from '@/types';

/**
 * Set once per tab once we've consumed a fragment. Guards against an
 * infinite reload loop if hash scrubbing silently fails (shouldn't, but
 * history.replaceState is best-effort across weird browsers).
 */
const REENTRY_FLAG = 'dev-jwt-import:consumed';
const PENDING_TOAST_KEY = 'dev-jwt-import:pending-toast';

/** Quick JWT shape check — doesn't verify signature, just structure. */
function looksLikeJwt(s: string): boolean {
  const parts = s.split('.');
  if (parts.length !== 3) return false;
  // Each part must be non-empty and base64url-ish.
  return parts.every((p) => p.length > 0 && /^[A-Za-z0-9_-]+$/.test(p));
}

function patchSettings(updates: Partial<ExtensionSettings>): void {
  try {
    const raw = localStorage.getItem('settings');
    const current = raw ? JSON.parse(raw) : {};
    localStorage.setItem(
      'settings',
      JSON.stringify({ ...current, ...updates, updatedAt: Date.now() }),
    );
  } catch {
    /* Corrupted settings blob — overwrite with just our updates so the
     * app at least boots into the right auth mode. */
    localStorage.setItem(
      'settings',
      JSON.stringify({ ...updates, updatedAt: Date.now() }),
    );
  }
}

/**
 * Parse `window.location.hash` and act on any `dev-jwt=` fragment.
 * Must be called BEFORE the auth provider / React tree initializes.
 */
export function tryImportDevJwt(): void {
  // Belt + suspenders: even if something static-imports this in prod,
  // the runtime check no-ops it.
  if (!import.meta.env.DEV) return;

  if (typeof window === 'undefined') return;

  // Hash on arrival looks like "#dev-jwt=eyJ...&dev-auth=1"
  const rawHash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  if (!rawHash) return;

  const params = new URLSearchParams(rawHash);
  const jwt = params.get('dev-jwt');
  if (!jwt) return;

  // Prevent re-entry if reload somehow lands back here with the hash.
  if (sessionStorage.getItem(REENTRY_FLAG) === '1') {
    // eslint-disable-next-line no-console
    console.warn('[dev-jwt-import] re-entry detected, skipping to avoid loop');
    try { sessionStorage.removeItem(REENTRY_FLAG); } catch { /* ignore */ }
    return;
  }

  if (!looksLikeJwt(jwt)) {
    // eslint-disable-next-line no-console
    console.warn('[dev-jwt-import] dev-jwt fragment present but not a well-formed JWT; ignoring');
    return;
  }

  const autoEnable = params.get('dev-auth') === '1';

  try { sessionStorage.setItem(REENTRY_FLAG, '1'); } catch { /* ignore */ }

  // 1. Scrub the hash FIRST so the JWT doesn't linger in history.
  //    replaceState rewrites the URL bar without a navigation.
  try {
    const clean = window.location.pathname + window.location.search;
    window.history.replaceState(null, '', clean);
  } catch {
    /* Some sandboxed iframes disallow replaceState. Fall through — the
     * hash will still be on the URL but localStorage wins on next load. */
  }

  // 2. Install the JWT.
  localStorage.setItem(DEV_JWT_KEY, jwt);

  // 3. Optionally flip tokenAuthEnabled so the app actually uses it.
  if (autoEnable) {
    patchSettings({ tokenAuthEnabled: true });
  }

  // 4. Stash a one-shot toast payload for the next page load. The
  //    Toaster reads this on mount and clears it. We can't show a toast
  //    right now because we're about to reload.
  try {
    sessionStorage.setItem(
      PENDING_TOAST_KEY,
      JSON.stringify({
        title: 'Dev JWT imported',
        description: autoEnable
          ? 'Token auth enabled. Signing you in…'
          : 'Paste complete — enable Token Auth in Dev Settings to use it.',
      }),
    );
  } catch { /* ignore */ }

  // 5. Reload so the NeoAuthProvider sees the fresh localStorage on
  //    its first getAuthState() call.
  window.location.reload();
}

/**
 * After reload, flush the "import succeeded" toast saved above. Call this
 * AFTER the React tree has mounted so the <Toaster /> is listening.
 * Safe to call unconditionally — if there's no pending toast, it no-ops.
 */
export function flushPendingDevToast(): void {
  if (!import.meta.env.DEV) return;
  if (typeof window === 'undefined') return;

  let payload: { title: string; description?: string } | null = null;
  try {
    const raw = sessionStorage.getItem(PENDING_TOAST_KEY);
    if (raw) {
      payload = JSON.parse(raw);
      sessionStorage.removeItem(PENDING_TOAST_KEY);
    }
  } catch { /* corrupt or unavailable; ignore */ }

  // Also clear the re-entry flag now that we've safely landed.
  try { sessionStorage.removeItem(REENTRY_FLAG); } catch { /* ignore */ }

  if (payload?.title) {
    toast({ title: payload.title, description: payload.description, duration: 6000 });
  }
}

