/**
 * Shared formatting utilities for time, cron expressions, and schedule labels.
 */

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/* ── Time formatting ── */

export function formatTime12(hour: number, minute: number): string {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 || 12;
  const m = minute.toString().padStart(2, '0');
  return `${h}:${m} ${suffix}`;
}

export function formatTimestamp12(ts: number | Date, timeZone?: string): string {
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  });
}

/**
 * Past-only relative time, e.g. "Just now", "5m ago", "3d ago".
 * Suitable for notifications and activity timestamps.
 * Set isCompact=true to use week-based output after 7 days.
 */
export function formatTimeAgo(timestamp: number, isCompact = false): string {
  const diff = Math.max(0, Date.now() - timestamp);
  const secs = Math.floor(diff / 1000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (secs < 60) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (isCompact) return `${Math.floor(days / 7)}w ago`;

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Bidirectional relative time — past ("Just ran", "5m ago") and future ("In 5m", "In 2h").
 * Suitable for scheduled job next-run / last-run display.
 */
export function formatRelativeTime(timestamp: number): string {
  const diff = timestamp - Date.now();

  if (diff < 0) {
    const abs = Math.abs(diff);
    const secs = Math.floor(abs / 1000);
    const mins = Math.floor(secs / 60);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (secs < 60) return 'Just ran';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }

  const secs = Math.floor(diff / 1000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (secs < 60) return 'In < 1m';
  if (mins < 60) return `In ${mins}m`;
  if (hours < 24) return `In ${hours}h`;
  if (days < 7) return `In ${days}d`;

  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* ── Cron expression → human-readable ── */

export function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return expr;

  const [minF, hourF, dom, mon, dow] = parts;
  const min = parseInt(minF, 10);
  const hour = parseInt(hourF, 10);
  const hasTime = !Number.isNaN(min) && !Number.isNaN(hour);

  if (hasTime) {
    const time = formatTime12(hour, min);

    if (dom === '*' && mon === '*' && dow === '*') {
      return `Daily at ${time}`;
    }
    if (dom === '*' && mon === '*' && (dow === '1-5' || dow.toUpperCase() === 'MON-FRI')) {
      return `Weekdays at ${time}`;
    }
    if (dom === '*' && mon === '*' && (dow === '0,6' || dow === '6,0' || dow.toUpperCase() === 'SAT,SUN')) {
      return `Weekends at ${time}`;
    }
    if (dom === '*' && mon === '*' && dow !== '*') {
      const days = dow.split(',').map((d) => {
        const n = parseInt(d, 10);
        if (Number.isNaN(n)) return d.slice(0, 3);
        const dayIndex = n === 7 ? 0 : n;
        return DAY_NAMES[dayIndex] ?? d;
      });
      return `${days.join(', ')} at ${time}`;
    }
    if (dom !== '*' && mon === '*' && dow === '*') {
      const day = parseInt(dom, 10);
      if (!Number.isNaN(day)) return `Monthly on day ${day} at ${time}`;
    }
  }

  if (minF.startsWith('*/') && hourF === '*' && dom === '*' && mon === '*' && dow === '*') {
    const n = parseInt(minF.slice(2), 10);
    if (!Number.isNaN(n)) return n === 1 ? 'Every minute' : `Every ${n} minutes`;
  }

  if (minF === '0' && hourF.startsWith('*/') && dom === '*' && mon === '*' && dow === '*') {
    const n = parseInt(hourF.slice(2), 10);
    if (!Number.isNaN(n)) return n === 1 ? 'Every hour' : `Every ${n} hours`;
  }

  return expr;
}

/* ── Schedule label from raw schedule object ── */

interface RawSchedule {
  kind?: string;
  at?: string;
  everyMs?: number;
  expr?: string;
}

export function formatScheduleLabel(s: unknown): string | undefined {
  if (!s) return undefined;
  if (typeof s === 'string') return s;
  const raw = s as RawSchedule;
  if (raw.kind === 'at' && raw.at) {
    const d = new Date(raw.at);
    return Number.isNaN(d.getTime()) ? raw.at : `Once @ ${d.toLocaleString()}`;
  }
  if (raw.kind === 'every' && raw.everyMs) {
    const ms = raw.everyMs;
    if (ms < 60_000) return `Every ${Math.round(ms / 1000)}s`;
    const mins = Math.round(ms / 60_000);
    return mins >= 60 ? `Every ${Math.round(mins / 60)}h` : `Every ${mins}m`;
  }
  if (raw.kind === 'cron' && raw.expr) return describeCron(raw.expr);
  return undefined;
}

/* ── Date comparison ── */

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
