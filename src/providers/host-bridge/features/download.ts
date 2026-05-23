/**
 * Typed facade over the `file.save` host-bridge method. Converts a Blob to
 * base64 and hands it to the native side for saving to the device.
 *
 * On iOS the native side presents a UIDocumentPickerViewController (Files app).
 * On Android it writes to the Downloads directory via MediaStore.
 *
 * This module is only useful on native — callers should check
 * `hostBridge.isNative()` and fall back to the anchor-click approach on web.
 */

import { hostBridge } from '../core';

const METHOD_SAVE = 'file.save';

interface FileSaveParams {
  data: string;
  filename: string;
  mimeType: string;
}

interface FileSaveResult {
  success: boolean;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      // Strip the "data:...;base64," prefix
      const base64 = dataUrl.split(',')[1] ?? '';
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export const downloadBridge = {
  /**
   * Save a Blob to the device's file system via the native bridge. The blob
   * is converted to base64 and sent over the JSON bridge channel.
   *
   * @throws BridgeError with code `user_cancelled` if the user dismisses the
   *         save dialog (iOS), or `internal_error` on IO failure.
   */
  async save(blob: Blob, filename: string, mimeType?: string): Promise<void> {
    const base64 = await blobToBase64(blob);
    const resolvedMimeType = mimeType || blob.type || 'application/octet-stream';
    await hostBridge.request<FileSaveParams, FileSaveResult>(METHOD_SAVE, {
      data: base64,
      filename,
      mimeType: resolvedMimeType,
    });
  },
};

export type DownloadBridge = typeof downloadBridge;

/**
 * Save a Blob to the device using the native bridge if available, otherwise
 * fall back to the standard anchor-click download.
 */
export async function saveBlob(blob: Blob, filename: string, mimeType?: string): Promise<void> {
  if (hostBridge.isNative()) {
    await downloadBridge.save(blob, filename, mimeType);
    return;
  }
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}
