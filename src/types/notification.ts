/**
 * Cron notification entity - represents a completed cron job execution.
 */

export interface CronNotification {
  id: string;
  ts: number;
  jobId: string;
  jobName: string;
  summary: string;
  fullResponse?: string;
  status: 'ok' | 'error';
  durationMs: number;
  runAtMs: number;
  deliveryStatus?: string;
  sessionId?: string;
  sessionKey?: string;
  model?: string;
  provider?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}

export type SmartClassification = 'notify' | 'notify_draft' | 'notify_action';

export interface SmartNotificationAction {
  type: string;
  title: string;
  description: string;
  url?: string;
  parameters?: Record<string, string>;
  urgency?: 'low' | 'medium' | 'high';
}

export interface SmartNotification {
  classification: SmartClassification;
  title: string;
  reason: string;
  summary: string;
  missedImplication: string;
  ctaLabel: string;
  execute_prompt?: string;
  draft?: string;
  action?: SmartNotificationAction;
}

function isValidSmartNotification(obj: unknown): obj is SmartNotification {
  return (
    !!obj &&
    typeof obj === 'object' &&
    typeof (obj as Record<string, unknown>).classification === 'string' &&
    ['notify', 'notify_draft', 'notify_action'].includes(
      (obj as Record<string, unknown>).classification as string,
    ) &&
    typeof (obj as Record<string, unknown>).title === 'string'
  );
}

/**
 * Returns SmartNotification[] if the input is valid smart JSON (array or object).
 * Returns empty array for a valid but empty JSON array (e.g. "[]") — caller
 * should suppress the notification entirely. Returns null when the input is
 * not JSON or not in the smart format — caller should fall back to legacy toast.
 */
export function parseSmartNotifications(summary: string): SmartNotification[] | null {
  try {
    const parsed = JSON.parse(summary);
    if (Array.isArray(parsed)) {
      return parsed.filter(isValidSmartNotification);
    }
    if (isValidSmartNotification(parsed)) {
      return [parsed];
    }
  } catch {
    // Not JSON or invalid structure
  }
  return null;
}

const JSON_FENCED_RE = /```json\s*\n([\s\S]*?)```/;

/**
 * Tries multiple strategies to extract embedded JSON from prose text:
 *  1. ```json fenced code block
 *  2. Bare JSON array  — find the first `[` and match to its closing `]`
 *  3. Bare JSON object — find the first `{` and match to its closing `}`
 * Returns the extracted JSON string, or null if nothing viable is found.
 */
export function extractJsonBlock(text: string): string | null {
  const fenced = JSON_FENCED_RE.exec(text);
  if (fenced) return fenced[1].trim();

  const arraySlice = extractOutermostBrackets(text, '[', ']');
  if (arraySlice) return arraySlice;

  const objectSlice = extractOutermostBrackets(text, '{', '}');
  if (objectSlice) return objectSlice;

  return null;
}

/**
 * Walks the string from the first occurrence of `open` and counts nesting
 * depth to find the matching `close`. Returns the substring (inclusive) or
 * null when the brackets are never balanced.
 */
function extractOutermostBrackets(text: string, open: string, close: string): string | null {
  const start = text.indexOf(open);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === open) depth++;
    else if (ch === close) depth--;

    if (depth === 0) {
      return text.slice(start, i + 1);
    }
  }
  return null;
}

const SMART_KEYWORDS = [
  'classification',
  'notify',
  'notify_draft',
  'notify_action',
  'triage',
  'missedImplication',
  'ctaLabel',
  'Action needed'
] as const;

/**
 * Heuristic check: returns true when the raw text contains enough
 * SmartNotification-related keywords to justify an LLM reformat attempt.
 * Requires at least 2 keyword matches to avoid false positives.
 */
export function looksLikeSmartNotification(text: string): boolean {
  const lower = text.toLowerCase();
  let hits = 0;
  for (const kw of SMART_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) {
      hits++;
      if (hits >= 1) return true;
    }
  }
  return false;
}

export interface SkillFrontmatter {
  skill?: string;
  title?: string;
  [key: string]: unknown;
}

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/;

/**
 * Parse YAML-style frontmatter from skill output.
 * Returns the parsed key-value pairs and the remaining body, or null
 * if no frontmatter is present.
 */
export function parseSkillFrontmatter(
  text: string,
): { meta: SkillFrontmatter; body: string } | null {
  const match = FRONTMATTER_RE.exec(text.trim());
  if (!match) return null;

  const meta: SkillFrontmatter = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) meta[key] = value;
  }
  return { meta, body: match[2] };
}

export interface NotificationState {
  notifications: CronNotification[];
  readIds: Set<string>;
  isHydrated: boolean;
  unreadCount: number;
}
