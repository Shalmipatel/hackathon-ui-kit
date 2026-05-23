import { createRoot } from 'react-dom/client';
import { GlobalStyles } from '@/components';
import { TabPage, ConnectionGate, AppRoot } from '@/features/app/layouts';
import { Toaster } from '@/features/toast';
import { AddToHomeScreenBanner } from '@/features/app/components/AddToHomeScreenBanner';
import { initSuperProperties } from '@/features/analytics';
import { handleOAuthCallback, isOAuthCallback } from '@/features/travel/google-connect';

/* If this load is the Gmail OAuth popup landing back from Google,
 * branch BEFORE mounting the React tree — the popup just needs to
 * post the code to the server, notify the opener, and close. Booting
 * the full app shell here would briefly flash the trips view in the
 * popup, which looks broken. Redirect URI is the bare origin, so we
 * detect by query params + matching localStorage CSRF state instead
 * of a specific path. */
if (isOAuthCallback()) {
  document.body.innerHTML = `
    <div style="font-family: 'Inter', system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #fbfaf9; color: #242424;">
      <div style="text-align: center; padding: 32px;">
        <div style="font-weight: 600; font-size: 16px; margin-bottom: 6px;">Connecting Gmail…</div>
        <div id="oauth-status" style="font-size: 13px; color: rgba(36,36,36,0.6);">Handing the code off to the assistant.</div>
      </div>
    </div>`;
  void handleOAuthCallback();
} else {
  initSuperProperties(import.meta.env.VITE_APP_VERSION);
  bootApp();
}

function bootApp() {

/*
 * Analytics — the starter kit ships without any analytics SDK wired up.
 * Every `track(...)` and `identifyAnalyticsUser(...)` call in the app
 * goes through `src/features/analytics/analytics.ts`, which is a no-op
 * by default. Wire your SDK there to start collecting events.
 *
 * `initSuperProperties` still runs so the super-property bookkeeping
 * (app shell, viewport class, etc.) is ready to forward the moment an
 * SDK is plugged in.
 */
  void (async () => {
    let flushPendingDevToast: (() => void) | null = null;

    if (import.meta.env.DEV) {
      /* Dev-only #dev-jwt=… URL fragment importer. Tree-shaken from prod. */
      const dev = await import('./dev/providers/auth/dev-jwt-import');
      dev.tryImportDevJwt();
      flushPendingDevToast = dev.flushPendingDevToast;
    }

    const root = document.getElementById('root');
    if (!root) return;

    createRoot(root).render(
      <>
        <GlobalStyles />
        <AppRoot>
          <ConnectionGate>
            <TabPage />
            <AddToHomeScreenBanner />
          </ConnectionGate>
        </AppRoot>
        <Toaster />
      </>,
    );
    flushPendingDevToast?.();
  })();
}
