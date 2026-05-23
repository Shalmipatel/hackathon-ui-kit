/**
 * Neo transcription utilities ported from the extension's lib/.
 * Pure functions for signature generation and multipart body construction.
 *
 * - computeCrc32: zlib-compatible CRC32
 * - generateNeoSignature: SHA-256 → hex → CRC32 → "CRC32YESANDNO{ts}" → base64
 * - buildMultipartBody / randomBoundary / extensionFromMime: multipart form helpers
 */

const SEPARATOR = 'YESANDNO';

// ── CRC32 (zlib-compatible) ──

function computeCrc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ── Neo Signature ──

export async function generateNeoSignature(audioBytes: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', audioBytes.buffer as ArrayBuffer);
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const hashBytes = new TextEncoder().encode(hashHex);
  const crc32Value = computeCrc32(hashBytes);
  const timestamp = Math.floor(Date.now() / 1000);

  return btoa(`${crc32Value}${SEPARATOR}${timestamp}`);
}

// ── Multipart Form Helpers ──

export function extensionFromMime(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('mpeg')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  return 'webm';
}

export function randomBoundary(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const random = Array.from({ length: 16 }, () =>
    chars[Math.floor(Math.random() * chars.length)],
  ).join('');
  return `----WebKitFormBoundary${random}`;
}

export function buildMultipartBody(
  audioBytes: Uint8Array,
  mimeType: string,
  boundary: string,
): Uint8Array {
  const encoder = new TextEncoder();
  const ext = extensionFromMime(mimeType);

  const preamble = encoder.encode(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="input"; filename="input.${ext}"\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`,
  );
  const postamble = encoder.encode(`\r\n--${boundary}--\r\n`);

  const body = new Uint8Array(preamble.length + audioBytes.length + postamble.length);
  body.set(preamble, 0);
  body.set(audioBytes, preamble.length);
  body.set(postamble, preamble.length + audioBytes.length);

  return body;
}
