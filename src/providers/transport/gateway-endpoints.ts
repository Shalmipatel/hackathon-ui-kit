export const GATEWAY_ENDPOINTS = {
  CHAT: '/v1/responses',
  TOOLS_INVOKE: '/tools/invoke',
  AGENT_STATUS: '/api/neoclaw-agent/status',
  FILES: {
    UPLOAD: '/api/neoclaw-files/upload',
    DELETE: '/api/neoclaw-files',
    LIST: '/api/neoclaw-files/list',
  },
  CRON: { JOBS: '/api/neoclaw-cron/jobs' },
  SCHEDULER: { JOBS: '/api/neoclaw-scheduler/jobs' },
  PLATFORM: { EVENTS: '/api/neoclaw-platform/events' },
  FEEDBACK: '/api/neo/feedback',
} as const;
