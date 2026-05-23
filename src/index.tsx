import { createRoot } from 'react-dom/client';
import { GlobalStyles } from '@/components';
import { TabPage, ConnectionGate, AppRoot } from '@/features/app/layouts';
import { Toaster } from '@/features/toast';
import { AddToHomeScreenBanner } from '@/features/app/components/AddToHomeScreenBanner';
import { initSuperProperties } from '@/features/analytics';

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
initSuperProperties(import.meta.env.VITE_APP_VERSION);

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
