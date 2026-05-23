import { useState, useCallback } from 'react';
import { getTranscriptionClient } from '@/features/app/bootstrap/providers';
import type { TranscriptionError } from '@/types';

interface UseTranscribeResult {
  transcribe: (audioBlob: Blob, mimeType: string) => Promise<string | null>;
  isTranscribing: boolean;
  error: TranscriptionError | null;
  clearError: () => void;
}

/**
 * Hook for audio transcription.
 * Manages loading state and error handling.
 */
export function useTranscribe(): UseTranscribeResult {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<TranscriptionError | null>(null);

  const transcribe = useCallback(
    async (audioBlob: Blob, mimeType: string): Promise<string | null> => {
      setIsTranscribing(true);
      setError(null);

      try {
        const client = getTranscriptionClient();
        const text = await client.transcribe(audioBlob, mimeType);
        return text;
      } catch (err) {
        const transcriptionError = err as TranscriptionError;
        setError(transcriptionError);
        console.error('[NeoClaw] Transcription failed:', err);
        return null;
      } finally {
        setIsTranscribing(false);
      }
    },
    [],
  );

  const clearError = useCallback(() => setError(null), []);

  return { transcribe, isTranscribing, error, clearError };
}
