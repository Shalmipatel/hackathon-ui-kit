/**
 * useFileUpload Hook
 * Manages file upload state with progress tracking, cancellation, and server cleanup.
 * Supports deferred uploads: files can be queued without a sessionId and uploaded later.
 */

import { useState, useCallback, useRef } from 'react';
import type { FileAttachment } from '@/types';
import {
  ALLOWED_IMAGE_MIMES,
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
  THUMBNAIL_MAX_PX,
  THUMBNAIL_QUALITY,
} from '@/types';
import { uploadFile, deleteFile } from '@/providers/files';
import { getGateway } from '@/features/app/bootstrap/providers';

function isImageMime(mime: string): boolean {
  return (ALLOWED_IMAGE_MIMES as readonly string[]).includes(mime);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function generateThumbnail(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(THUMBNAIL_MAX_PX / img.width, THUMBNAIL_MAX_PX / img.height, 1);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', THUMBNAIL_QUALITY));
    };
    img.onerror = () => reject(new Error('Failed to load image for thumbnail'));
    img.src = dataUrl;
  });
}

export interface UseFileUploadReturn {
  pendingAttachments: FileAttachment[];
  isUploading: boolean;
  /** Queue and optionally upload files. If sessionId is null, files are queued locally as 'pending'. */
  uploadFiles: (files: File[], sessionId: string | null | undefined) => void;
  /** Upload all 'pending' files that were queued without a sessionId. */
  uploadPending: (sessionId: string) => void;
  /** Returns the raw File objects for all pending (not yet uploaded) attachments. */
  getPendingFiles: () => File[];
  cancelUpload: (attachmentId: string) => void;
  removeAttachment: (attachmentId: string) => Promise<void>;
  clearAttachments: () => void;
}

export function useFileUpload(): UseFileUploadReturn {
  const [pendingAttachments, setPendingAttachments] = useState<FileAttachment[]>([]);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  /** Store raw File objects keyed by attachment id, for deferred uploads */
  const fileStoreRef = useRef<Map<string, File>>(new Map());

  const isUploading = pendingAttachments.some((a) => a.uploadStatus === 'uploading');

  /** Start the actual upload for a single file */
  const startUpload = useCallback((attachmentId: string, file: File, sessionId: string) => {
    const abortController = new AbortController();
    abortControllersRef.current.set(attachmentId, abortController);

    // Mark as uploading
    setPendingAttachments((prev) =>
      prev.map((a) =>
        a.id === attachmentId ? { ...a, uploadStatus: 'uploading' as const, uploadProgress: 0 } : a,
      ),
    );

    (async () => {
      try {
        const result = await uploadFile(getGateway(), {
          file,
          sessionId,
          signal: abortController.signal,
          onProgress: (percent) => {
            setPendingAttachments((prev) =>
              prev.map((a) =>
                a.id === attachmentId ? { ...a, uploadProgress: percent } : a,
              ),
            );
          },
        });

        abortControllersRef.current.delete(attachmentId);
        fileStoreRef.current.delete(attachmentId);

        if (result.success) {
          setPendingAttachments((prev) =>
            prev.map((a) =>
              a.id === attachmentId
                ? {
                    ...a,
                    uploadStatus: 'completed',
                    uploadProgress: 100,
                    serverPath: result.serverPath,
                    downloadUrl: result.downloadUrl,
                  }
                : a,
            ),
          );
        } else {
          setPendingAttachments((prev) =>
            prev.map((a) =>
              a.id === attachmentId
                ? { ...a, uploadStatus: 'failed', uploadError: result.error }
                : a,
            ),
          );
        }
      } catch (error) {
        abortControllersRef.current.delete(attachmentId);
        fileStoreRef.current.delete(attachmentId);

        if (error instanceof Error && error.name === 'AbortError') {
          setPendingAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
        } else {
          setPendingAttachments((prev) =>
            prev.map((a) =>
              a.id === attachmentId
                ? {
                    ...a,
                    uploadStatus: 'failed',
                    uploadError: error instanceof Error ? error.message : 'Upload failed',
                  }
                : a,
            ),
          );
        }
      }
    })();
  }, []);

  const uploadFiles = useCallback((files: File[], sessionId: string | null | undefined) => {
    for (const file of files) {
      const isImage = isImageMime(file.type);
      const maxBytes = isImage ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;

      if (file.size > maxBytes) {
        console.warn(
          `[useFileUpload] File too large: ${file.name} (${formatFileSize(file.size)}, max ${formatFileSize(maxBytes)})`,
        );
        continue;
      }

      const attachmentId = crypto.randomUUID();

      // Store raw file for deferred upload
      fileStoreRef.current.set(attachmentId, file);

      const attachment: FileAttachment = {
        id: attachmentId,
        filename: file.name,
        mediaType: file.type,
        size: file.size,
        category: isImage ? 'image' : 'file',
        uploadStatus: sessionId ? 'uploading' : 'pending',
        uploadProgress: 0,
      };

      setPendingAttachments((prev) => [...prev, attachment]);

      // Generate thumbnail for images (always, even without sessionId)
      if (isImage) {
        (async () => {
          try {
            const reader = new FileReader();
            const dataUrl = await new Promise<string>((resolve, reject) => {
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });

            const thumbnailDataUrl = await generateThumbnail(dataUrl);

            setPendingAttachments((prev) =>
              prev.map((a) =>
                a.id === attachmentId
                  ? { ...a, dataUrl, thumbnailDataUrl }
                  : a,
              ),
            );
          } catch {
            // Continue without thumbnail
          }
        })();
      }

      // If we have a sessionId, start uploading immediately
      if (sessionId) {
        startUpload(attachmentId, file, sessionId);
      }
    }
  }, [startUpload]);

  const uploadPending = useCallback((sessionId: string) => {
    // Get current pending attachments and start uploads
    setPendingAttachments((prev) => {
      for (const att of prev) {
        if (att.uploadStatus === 'pending') {
          const file = fileStoreRef.current.get(att.id);
          if (file) {
            // Kick off upload (runs async)
            startUpload(att.id, file, sessionId);
          }
        }
      }
      return prev;
    });
  }, [startUpload]);

  const getPendingFiles = useCallback(() => {
    const files: File[] = [];
    for (const [, file] of fileStoreRef.current) {
      files.push(file);
    }
    return files;
  }, []);

  const cancelUpload = useCallback((attachmentId: string) => {
    const controller = abortControllersRef.current.get(attachmentId);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(attachmentId);
    }
    fileStoreRef.current.delete(attachmentId);
    setPendingAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
  }, []);

  const removeAttachment = useCallback(async (attachmentId: string) => {
    const attachment = pendingAttachments.find((a) => a.id === attachmentId);

    if (attachment?.uploadStatus === 'uploading') {
      cancelUpload(attachmentId);
      return;
    }

    // If pending (not uploaded), just remove locally
    if (attachment?.uploadStatus === 'pending') {
      fileStoreRef.current.delete(attachmentId);
      setPendingAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
      return;
    }

    if (attachment?.serverPath) {
      try {
        await deleteFile(getGateway(), attachment.serverPath);
      } catch (error) {
        console.warn('[useFileUpload] Failed to delete file from server:', error);
      }
    }

    fileStoreRef.current.delete(attachmentId);
    setPendingAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
  }, [pendingAttachments, cancelUpload]);

  const clearAttachments = useCallback(() => {
    for (const [id, controller] of abortControllersRef.current) {
      controller.abort();
      abortControllersRef.current.delete(id);
    }
    fileStoreRef.current.clear();
    setPendingAttachments([]);
  }, []);

  return {
    pendingAttachments,
    isUploading,
    uploadFiles,
    uploadPending,
    getPendingFiles,
    cancelUpload,
    removeAttachment,
    clearAttachments,
  };
}
