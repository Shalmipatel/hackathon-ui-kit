/**
 * Request body builder for OpenAI-compatible chat API.
 * Handles message formatting, attachments, and audio.
 *
 * File attachments use server-side paths instead of base64 encoding.
 * The LLM can read files using the provided paths.
 */

import type { FileAttachment } from '@/types';

export interface BuildInputOptions {
  messages: { role: string; content: string }[];
  audioDataUrl?: string;
  attachments?: FileAttachment[];
}

/**
 * Build the input array for the chat API request.
 * File attachments are included as path references in the text content.
 * Audio recordings still use base64 encoding.
 */
export function buildInput(options: BuildInputOptions): unknown[] {
  const { messages, audioDataUrl, attachments } = options;

  return messages.map((msg, idx) => {
    const isLastUser = msg.role === 'user' && idx === messages.length - 1;

    if (isLastUser) {
      const uploadedFiles = attachments?.filter((a) => a.serverPath) ?? [];
      const hasUploadedFiles = uploadedFiles.length > 0;

      if (hasUploadedFiles || audioDataUrl) {
        const contentParts: Record<string, unknown>[] = [];

        let text = msg.content;

        if (hasUploadedFiles) {
          const fileContext = uploadedFiles
            .map((a) => {
              const fullPath = a.serverPath?.startsWith('neoclaw-files/')
                ? a.serverPath
                : `neoclaw-files/${a.serverPath}`;
              return `[Attached file: ${a.filename}]\nPath: ${fullPath}`;
            })
            .join('\n\n');
          text = `${fileContext}\n\n${text}`;
        }

        contentParts.push({ type: 'input_text', text });

        if (audioDataUrl) {
          const parsed = parseDataUrl(audioDataUrl);
          if (parsed) {
            const mediaType = parsed.mimeType.split(';')[0].trim();
            const ext = audioDataUrl.includes('webm')
              ? 'webm'
              : audioDataUrl.includes('ogg')
                ? 'ogg'
                : 'webm';
            contentParts.push({
              type: 'input_file',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: parsed.base64,
                filename: `voice-message.${ext}`,
              },
            });
          }
        }

        return { type: 'message', role: msg.role, content: contentParts };
      }
    }

    return { type: 'message', role: msg.role, content: msg.content };
  });
}

/**
 * Parse a data URL into its MIME type and base64 content.
 */
export function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  const match = dataUrl.match(/^data:([^;]+(?:;[^;]+)*?);base64,(.+)$/s);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}
