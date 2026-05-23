import type { ChatMessage, RemoteMessage } from '@/types';

const SECURITY_ALERT_RE = /<security-alert[^>]*>([\s\S]*?)<\/security-alert>/g;

/**
 * Extracts `<security-alert>` blocks from text.
 * Returns the inner content of each alert and the remaining text.
 */
function extractSecurityAlerts(text: string): { alerts: string[]; remaining: string } {
  const alerts: string[] = [];
  const remaining = text
    .replace(SECURITY_ALERT_RE, (_match, content: string) => {
      const trimmed = content.trim();
      if (trimmed) alerts.push(trimmed);
      return '';
    })
    .trim();
  return { alerts, remaining };
}

/**
 * Converts backend RemoteMessage[] to client ChatMessage[].
 *
 * Only text content is extracted — attachment binary data, thumbnails,
 * and AttachmentMeta are NOT recoverable from the backend history.
 * Tool call / tool result turns are filtered out.
 */
export function mapRemoteMessages(remote: RemoteMessage[]): ChatMessage[] {
  const mapped: ChatMessage[] = [];

  for (const msg of remote) {
    if (msg.role === 'toolCall' || msg.role === 'toolResult') continue;

    const role = normalizeRole(msg.role);
    if (!role) continue;

    let text = extractText(msg.content);

    if (role === 'user') {
      const { alerts, remaining } = extractSecurityAlerts(text);
      for (const alert of alerts) {
        mapped.push({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: alert,
          timestamp: msg.timestamp,
        });
      }
      text = sanitizeUserText(remaining);
    }

    if (!text && role !== 'system') continue;

    mapped.push({
      id: crypto.randomUUID(),
      role,
      content: text,
      timestamp: msg.timestamp,
    });
  }

  return mapped;
}

/** Extract the title from the first user message (first 80 chars). */
export function extractTitleFromMessages(messages: RemoteMessage[]): string {
  for (const msg of messages) {
    if (msg.role !== 'user') continue;
    const { remaining } = extractSecurityAlerts(extractText(msg.content));
    const text = sanitizeUserText(remaining);
    if (text) return text.slice(0, 80);
  }
  return 'Restored session';
}

function normalizeRole(role: string): ChatMessage['role'] | null {
  if (role === 'user') return 'user';
  if (role === 'assistant') return 'assistant';
  if (role === 'system') return 'system';
  return null;
}

const CONTEXT_MARKER = '[Chat messages since your last reply - for context]';
const CURRENT_MSG_MARKER = '[Current message - respond to this]\n';

/**
 * Sanitize ChatMessages: strip context blocks from user messages and
 * move <security-alert> content into separate assistant messages.
 * Safe to call on already-sanitized data (no-op).
 */
export function sanitizeChatMessages(messages: ChatMessage[]): ChatMessage[] {
  const result: ChatMessage[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      const { alerts, remaining } = extractSecurityAlerts(m.content);
      for (const alert of alerts) {
        result.push({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: alert,
          timestamp: m.timestamp,
        });
      }
      const sanitized = sanitizeUserText(remaining);
      if (sanitized) {
        result.push({ ...m, content: sanitized });
      }
    } else {
      result.push(m);
    }
  }
  return result;
}

/**
 * Strips the OpenClaw sliding-window context block from user messages,
 * extracting only the actual current user message text.
 */
export function sanitizeUserText(raw: string): string {
  const contextIdx = raw.indexOf(CONTEXT_MARKER);
  if (contextIdx === -1) return raw.trim();

  const prefix = raw.slice(0, contextIdx).trim();

  const currentMsgIdx = raw.lastIndexOf(CURRENT_MSG_MARKER);
  if (currentMsgIdx === -1) {
    const firstUserIdx = raw.indexOf('\nUser: ', contextIdx);
    const userLine = firstUserIdx !== -1
      ? (() => { const a = raw.slice(firstUserIdx + '\nUser: '.length); const e = a.indexOf('\n'); return (e !== -1 ? a.slice(0, e) : a).trim(); })()
      : '';
    if (prefix && userLine) return `${prefix}\n\n${userLine}`;
    if (prefix) return prefix;
    return userLine;
  }

  let currentMsg = raw.slice(currentMsgIdx + CURRENT_MSG_MARKER.length);
  currentMsg = currentMsg.replace(/^User:\s*/, '').trim();

  return prefix ? `${prefix}\n\n${currentMsg}` : currentMsg;
}

function extractText(content: RemoteMessage['content']): string {
  if (!Array.isArray(content)) return '';
  return content
    .filter((c) => c.type === 'text' && c.text)
    .map((c) => c.text!)
    .join('\n')
    .trim();
}
