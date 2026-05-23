/**
 * Transport layer for the transcription server.
 *
 * Separate from GatewayTransport because:
 *   - Different server (transcription URL, not gateway)
 *   - Different auth (X-Neo-Signature, not Bearer token)
 *   - Different body format (multipart, not JSON)
 *   - 30s timeout (transcription is slower than gateway calls)
 */

import type { IStorageProvider, ExtensionSettings } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';
import { resolveConfig } from '@/features/app/config';
import { withTimeout } from '@/providers/transport/timeout-signal.util';

const TRANSCRIPTION_TIMEOUT_MS = 30_000;

export class TranscriptionTransport {
  constructor(private settingsProvider: IStorageProvider) {}

  async request(
    headers: Record<string, string>,
    body: Blob,
    signal?: AbortSignal,
  ): Promise<Response> {
    const settings = await this.settingsProvider.get<ExtensionSettings>('settings', DEFAULT_SETTINGS);
    const config = resolveConfig(settings);

    const { signal: mergedSignal, cleanup } = withTimeout(TRANSCRIPTION_TIMEOUT_MS, signal);

    try {
      const resp = await fetch(config.api.transcription.url, {
        method: 'POST',
        headers,
        body,
        signal: mergedSignal,
      });

      return resp;
    } finally {
      cleanup();
    }
  }
}
