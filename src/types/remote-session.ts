/** Data shapes returned by the OpenClaw `sessions_list` and `sessions_history` tools. */

export interface RemoteSessionSummary {
  key: string;
  sessionId: string;
  updatedAt: number;
  totalTokens: number;
  displayName?: string;
  label?: string;
  kind?: string;
  channel?: string;
  systemSent?: boolean;
}

export interface RemoteMessage {
  role: string;
  content: Array<{ type: string; text?: string; id?: string; name?: string }>;
  timestamp: number;
}

export interface RemoteSessionHistory {
  sessionKey: string;
  messages: RemoteMessage[];
  truncated: boolean;
  contentTruncated: boolean;
}
