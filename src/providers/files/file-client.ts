/**
 * File operations: upload, delete, list.
 *
 * Web-native replacement for the extension's FILE_UPLOAD and FETCH handlers.
 * Uses GatewayTransport for auth, agent ID, fallback IP, credentials.
 *
 * Fixes vs original file-upload.service.ts:
 *   - DI violation removed (no more bootstrap import)
 *   - x-openclaw-agent-id now included (was missing)
 *   - Timeout enforced via GatewayTransport (was missing)
 *   - 401 → AuthExpiredError (was missing)
 */

import type { GatewayTransport } from '@/providers/transport/gateway-transport';
import { GATEWAY_ENDPOINTS } from '@/providers/transport/gateway-endpoints';

export interface UploadOptions {
  file: File;
  sessionId: string;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

export interface UploadResult {
  success: boolean;
  serverPath?: string;
  downloadUrl?: string;
  error?: string;
}

export interface UploadResponse {
  success: boolean;
  file: {
    name: string;
    folder: string;
    path: string;
    size: number;
    mimeType: string;
    createdAt: string;
    downloadUrl: string;
  };
}

/**
 * Upload a file to the server via FormData.
 *
 * Extension parity:
 *   - FormData field name "file" (matches server expectations)
 *   - X-Session-Id header
 *   - Simulated progress: 10% → 50% → 100%
 *   - Abort signal support
 *   - Error text truncated to 200 chars
 */
export async function uploadFile(
  gateway: GatewayTransport,
  options: UploadOptions,
): Promise<UploadResult> {
  const { file, sessionId, onProgress, signal } = options;

  if (signal?.aborted) {
    return { success: false, error: 'Upload cancelled' };
  }

  try {
    onProgress?.(10);

    const formData = new FormData();
    formData.append('file', file, file.name);

    onProgress?.(50);

    if (signal?.aborted) {
      return { success: false, error: 'Upload cancelled' };
    }

    const resp = await gateway.request(GATEWAY_ENDPOINTS.FILES.UPLOAD, {
      method: 'POST',
      headers: { 'X-Session-Id': sessionId },
      body: formData,
      timeoutMs: 60_000,
      signal,
    });

    onProgress?.(100);

    const response = (await resp.json()) as UploadResponse;
    if (response.success && response.file) {
      return {
        success: true,
        serverPath: response.file.path,
        downloadUrl: response.file.downloadUrl,
      };
    }

    return { success: false, error: 'Invalid server response' };
  } catch (error) {
    if (error instanceof Error && (error.message === 'Upload cancelled' || error.name === 'AbortError')) {
      return { success: false, error: 'Upload cancelled' };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
}

/**
 * Delete a file from the server.
 * Returns false silently on failure (matches original behavior).
 */
export async function deleteFile(
  gateway: GatewayTransport,
  path: string,
): Promise<boolean> {
  try {
    const endpoint = `${GATEWAY_ENDPOINTS.FILES.DELETE}?path=${encodeURIComponent(path)}`;
    const resp = await gateway.request(endpoint, {
      method: 'DELETE',
      timeoutMs: 10_000,
    });

    const response = await resp.json();
    return response.success === true;
  } catch (error) {
    console.warn('[FileClient] Delete error:', error);
    return false;
  }
}

export interface SessionFile {
  name: string;
  folder: 'uploads' | 'generated';
  path: string;
  size: number;
  mimeType: string;
  createdAt: string;
  downloadUrl: string;
}

export interface ListFilesResponse {
  success: boolean;
  sessionId: string;
  files: SessionFile[];
}

/**
 * List files for a session.
 * Returns empty array silently on failure (matches original behavior).
 */
export async function listFiles(
  gateway: GatewayTransport,
  sessionId: string,
): Promise<SessionFile[]> {
  try {
    const endpoint = `${GATEWAY_ENDPOINTS.FILES.LIST}?session_id=${encodeURIComponent(sessionId)}`;
    const resp = await gateway.request(endpoint, {
      method: 'GET',
      timeoutMs: 10_000,
    });

    const response: ListFilesResponse = await resp.json();
    return response.success ? response.files : [];
  } catch (error) {
    console.warn('[FileClient] List files error:', error);
    return [];
  }
}
