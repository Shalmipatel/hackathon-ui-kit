/**
 * useSessionFiles Hook
 * Fetches and manages session files from the server.
 *
 * A single effect refetches when sessionId or refreshTrigger changes (avoids duplicate
 * /api/neoclaw-files/list calls from overlapping effects in the panel).
 */

import { useState, useCallback, useEffect } from 'react';
import { listFiles, deleteFile, type SessionFile } from '@/providers/files';
import { getGateway } from '@/features/app/bootstrap/providers';

export type { SessionFile };

export interface UseSessionFilesReturn {
  files: SessionFile[];
  uploadedFiles: SessionFile[];
  generatedFiles: SessionFile[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  deleteSessionFile: (path: string) => Promise<boolean>;
}

export function useSessionFiles(
  sessionId: string | null,
  /** When this value changes (e.g. attachment count), the list is refetched. */
  refreshTrigger?: number,
): UseSessionFilesReturn {
  const [files, setFiles] = useState<SessionFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!sessionId) {
      setFiles([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await listFiles(getGateway(), sessionId);
      setFiles(result);
    } catch (err) {
      console.warn('[useSessionFiles] Failed to fetch files:', err);
      setError(err instanceof Error ? err.message : 'Failed to load files');
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  const deleteSessionFile = useCallback(
    async (path: string): Promise<boolean> => {
      try {
        const success = await deleteFile(getGateway(), path);

        if (success) {
          setFiles((prev) => prev.filter((f) => f.path !== path));
        }

        return success;
      } catch (err) {
        console.warn('[useSessionFiles] Failed to delete file:', err);
        return false;
      }
    },
    [],
  );

  useEffect(() => {
    void refresh();
  }, [sessionId, refreshTrigger, refresh]);

  const uploadedFiles = files.filter((f) => f.folder === 'uploads');
  const generatedFiles = files.filter((f) => f.folder === 'generated');

  return {
    files,
    uploadedFiles,
    generatedFiles,
    isLoading,
    error,
    refresh,
    deleteSessionFile,
  };
}
