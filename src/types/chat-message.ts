/** Upload status for file attachments */
export type UploadStatus = 'pending' | 'uploading' | 'completed' | 'failed' | 'cancelled';

/** Full file attachment with upload state — used transiently in-flight (UI → background → API) */
export interface FileAttachment {
  id: string;
  filename: string;
  mediaType: string;
  size: number;
  category: 'file' | 'image';
  /** Base64 data URL for local preview (optional, not persisted) */
  dataUrl?: string;
  /** Compressed JPEG thumbnail data URL for image attachments (~5-15 KB) */
  thumbnailDataUrl?: string;
  /** Server-side path after upload, e.g. "neoclaw-files/{sessionId}/uploads/file.pdf" */
  serverPath?: string;
  /** Download URL path, e.g. "/neoclaw-files/{sessionId}/uploads/file.pdf" */
  downloadUrl?: string;
  /** Upload status (not persisted) */
  uploadStatus?: UploadStatus;
  /** Upload progress 0-100 (not persisted) */
  uploadProgress?: number;
  /** Upload error message (not persisted) */
  uploadError?: string;
}

/** Storage-friendly attachment metadata (persisted in chat history, no base64 data) */
export interface AttachmentMeta {
  id: string;
  filename: string;
  mediaType: string;
  size: number;
  category: 'file' | 'image';
  /** Compressed JPEG thumbnail data URL for image attachments (~5-15 KB) */
  thumbnailDataUrl?: string;
  /** Server-side path after upload */
  serverPath?: string;
  /** Download URL path */
  downloadUrl?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  /** Base64 data URL of a recorded voice message (WebM audio) */
  audioDataUrl?: string;
  attachments?: AttachmentMeta[];
  /** When true, the message is excluded from the visible UI but kept in history for API context */
  isHidden?: boolean;
}

export type ConnectionStatus = 'idle' | 'streaming' | 'error';

/** Wire format for the OpenAI-compatible Chat Completions API */
export interface OpenAIChatMessage {
  role: string;
  content: string;
}
