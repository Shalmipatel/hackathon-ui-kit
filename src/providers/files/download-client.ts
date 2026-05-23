/**
 * Web-native file download utility.
 *
 * Replaces extension's DOWNLOAD_FILE handler (chrome.downloads.download)
 * with Blob + anchor element + URL.createObjectURL pattern on the web,
 * and the native `file.save` bridge method on iOS/Android.
 *
 * Uses GatewayTransport for auth, agent ID, fallback IP, credentials.
 */

import { saveBlob } from '@/providers/host-bridge';
import type { GatewayTransport } from '@/providers/transport/gateway-transport';

export async function downloadFile(
  gateway: GatewayTransport,
  path: string,
): Promise<void> {
  if (!path) throw new Error('Missing path parameter');

  const prepared = await gateway.prepareRequest(path, { method: 'GET' });

  const resp = await fetch(prepared.url, prepared.init);
  if (!resp.ok) {
    throw new Error(`Download failed: ${resp.status} ${resp.statusText}`);
  }

  let filename = path.split('/').pop() || 'download';
  const contentDisposition = resp.headers.get('Content-Disposition');
  if (contentDisposition) {
    const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    if (match?.[1]) {
      filename = match[1].replace(/['"]/g, '');
    }
  }

  const blob = await resp.blob();
  await saveBlob(blob, filename, resp.headers.get('Content-Type') ?? undefined);
}
