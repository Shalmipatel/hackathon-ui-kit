/// <reference types="vite/client" />

declare module '@novnc/novnc/lib/rfb.js' {
  const value: unknown;
  export default value;
}

interface ImportMetaEnv {
  readonly VITE_NEOCLAW_API_URL?: string;
  readonly VITE_NEOCLAW_API_KEY?: string;

  readonly VITE_TRANSCRIPTION_URL?: string;
  readonly VITE_INTEGRATION_BASE_URL?: string;
  readonly VITE_IDENTITY_BASE_URL?: string;

  readonly VITE_AUTH_CALLBACK_BASE_URL?: string;
  readonly VITE_ALLOWED_APP_ORIGINS?: string;
  readonly VITE_ALLOWED_CALLBACK_ORIGINS?: string;

  /** Stamped by vite.config.ts from package.json — always defined in built
   *  code. Used as the `app_version` analytics super-property. */
  readonly VITE_APP_VERSION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
