export const ALLOWED_FILE_MIMES = [
  'text/plain',
  'text/markdown',
  'text/html',
  'text/csv',
  'application/json',
  'application/pdf',
] as const;

export const ALLOWED_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

export const ALL_ALLOWED_MIMES: readonly string[] = [
  ...ALLOWED_FILE_MIMES,
  ...ALLOWED_IMAGE_MIMES,
];

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_BODY_BYTES = 20 * 1024 * 1024;

export const FILE_INPUT_ACCEPT = '*';

export const THUMBNAIL_MAX_PX = 120;
export const THUMBNAIL_QUALITY = 0.7;

/** Session key prefix for system operations (server-side tracking) */
export const SYSTEM_SESSION_KEY_PREFIX = '__system__';

/** Default timeout for non-streaming requests (10 seconds) */
export const NON_STREAMING_TIMEOUT_MS = 10_000;

/** Tool indicator display mode: 'pill' (default) or 'inline' (text-only like "Working...") */
export type ToolIndicatorMode = 'pill' | 'inline';
export const TOOL_INDICATOR_MODE: ToolIndicatorMode = 'inline';
