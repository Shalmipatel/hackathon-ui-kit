export const TOOL_DISPLAY_MAX_LENGTH = 70;

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

export function extractFilename(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0] || url;
  }
}

export function formatArgValue(
  value: string,
  format: 'filename' | 'domain' | 'query'
): string {
  switch (format) {
    case 'filename':
      return truncateText(extractFilename(value), TOOL_DISPLAY_MAX_LENGTH);
    case 'domain':
      return truncateText(extractDomain(value), TOOL_DISPLAY_MAX_LENGTH);
    case 'query':
      return `"${truncateText(value, TOOL_DISPLAY_MAX_LENGTH)}"`;
    default:
      return truncateText(value, TOOL_DISPLAY_MAX_LENGTH);
  }
}

export function getCodeHash(code: string): string {
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    const char = code.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}
