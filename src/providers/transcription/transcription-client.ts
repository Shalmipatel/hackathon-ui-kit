/**
 * Transcription client — converts audio to text via the transcription server.
 *
 * Capabilities (1:1 with extension):
 *  - Blob → ArrayBuffer → Uint8Array (skips the base64 roundtrip the bridge required)
 *  - Random boundary generation (same algorithm)
 *  - Multipart body: field name "input", filename "input.{ext}" (same algorithm)
 *  - Neo signature: SHA-256 → hex → CRC32 → "CRC32YESANDNO{ts}" → base64
 *  - Content-Type: multipart/form-data; boundary=... + X-Neo-Signature headers
 *  - No Authorization header (signature-based auth only)
 *  - Non-ok response text truncation to 200 chars
 *  - Success JSON parsing with data.text.trim()
 *  - TranscriptionError wrapping with enhanced HTTP status mapping
 *  - Error instance preservation (no double-wrapping)
 *  - 30s timeout via TranscriptionTransport (was missing in original)
 */

import type { ITranscriptionClient } from '@/types';
import { TranscriptionError, TranscriptionErrorCode } from '@/types';
import type { TranscriptionTransport } from './transcription-transport';
import {
  generateNeoSignature,
  buildMultipartBody,
  randomBoundary,
} from './transcription.util';

interface TranscribeResponse {
  text: string;
}

export class TranscriptionClient implements ITranscriptionClient {
  constructor(private transport: TranscriptionTransport) {}

  async transcribe(audioBlob: Blob, mimeType: string): Promise<string> {
    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBytes = new Uint8Array(arrayBuffer);

      const boundary = randomBoundary();
      const body = buildMultipartBody(audioBytes, mimeType, boundary);
      const signature = await generateNeoSignature(audioBytes);

      const resp = await this.transport.request(
        {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'X-Neo-Signature': signature,
        },
        new Blob([body.buffer as ArrayBuffer]),
      );

      if (!resp.ok) {
        const errorText = await resp.text();
        throw new TranscriptionError(
          `HTTP ${resp.status}: ${errorText.slice(0, 200)}`,
          this.mapStatusToErrorCode(resp.status),
        );
      }

      const data = (await resp.json()) as TranscribeResponse;
      return data.text.trim();
    } catch (error) {
      if (error instanceof TranscriptionError) throw error;

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new TranscriptionError(
          'Transcription request timed out',
          TranscriptionErrorCode.TIMEOUT,
          error,
        );
      }

      if (error instanceof TypeError) {
        throw new TranscriptionError(
          error.message || 'Network error during transcription',
          TranscriptionErrorCode.NETWORK_ERROR,
          error,
        );
      }

      throw new TranscriptionError(
        error instanceof Error ? error.message : 'Transcription failed',
        TranscriptionErrorCode.UNKNOWN,
        error,
      );
    }
  }

  private mapStatusToErrorCode(status: number): TranscriptionErrorCode {
    if (status === 401 || status === 403) return TranscriptionErrorCode.AUTH_ERROR;
    if (status === 400 || status === 415 || status === 422) return TranscriptionErrorCode.INVALID_AUDIO;
    if (status >= 500) return TranscriptionErrorCode.SERVER_ERROR;
    return TranscriptionErrorCode.NETWORK_ERROR;
  }
}
