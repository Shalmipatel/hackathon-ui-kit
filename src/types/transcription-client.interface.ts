/**
 * Contract for audio transcription services.
 */
export interface ITranscriptionClient {
  /**
   * Transcribe audio to text.
   * @param audioBlob - Recorded audio (webm, ogg, mp4)
   * @param mimeType - Audio MIME type
   * @returns Transcribed text
   * @throws TranscriptionError on failure
   */
  transcribe(audioBlob: Blob, mimeType: string): Promise<string>;
}

export class TranscriptionError extends Error {
  constructor(
    message: string,
    public readonly code: TranscriptionErrorCode,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'TranscriptionError';
  }
}

export enum TranscriptionErrorCode {
  NETWORK_ERROR = 'NETWORK_ERROR',
  AUTH_ERROR = 'AUTH_ERROR',
  INVALID_AUDIO = 'INVALID_AUDIO',
  SERVER_ERROR = 'SERVER_ERROR',
  TIMEOUT = 'TIMEOUT',
  UNKNOWN = 'UNKNOWN',
}
