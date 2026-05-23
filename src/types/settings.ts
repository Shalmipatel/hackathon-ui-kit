export interface ExtensionSettings {
  version: string;
  enabled: boolean;
  theme: 'light' | 'dark' | 'auto';
  notifications: boolean;
  debugMode: boolean;
  customOptions: Record<string, unknown>;
  updatedAt: number;
  fallbackTargetIpEnabled: boolean;
  fallbackTargetIp: string;
  transcriptionUrl: string;
  tokenAuthEnabled: boolean;
  agentApiEnabled: boolean;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  version: '1.0.0',
  enabled: true,
  theme: 'auto',
  notifications: true,
  debugMode: false,
  customOptions: {},
  updatedAt: Date.now(),
  fallbackTargetIpEnabled: false,
  fallbackTargetIp: '',
  transcriptionUrl: '',
  tokenAuthEnabled: false,
  /* Starter-kit default: use the OpenAI-compatible `/v1/responses` SSE
   * endpoint (StreamClient) instead of the agent API
   * (`/api/neoclaw-agent/chat`, AgentStreamClient). The agent endpoint
   * typically requires a user-session cookie that a bare access token
   * can't satisfy. `/v1/responses` happily accepts
   * `Authorization: Bearer <access-token>` proxied via `/api/gw/`, so
   * it works out of the box once you set VITE_NEOCLAW_API_URL +
   * VITE_NEOCLAW_API_KEY. Flip back to `true` once you wire real auth. */
  agentApiEnabled: false,
};
