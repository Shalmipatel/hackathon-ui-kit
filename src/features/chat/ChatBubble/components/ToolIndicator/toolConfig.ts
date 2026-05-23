import type { ToolDisplayConfig } from '../../types';

export const TOOL_DISPLAY_CONFIG: Record<string, ToolDisplayConfig> = {
  // File operations
  read: { running: 'Reading', processing: 'Processing file...', argKey: 'path', formatArg: 'filename' },
  write: { running: 'Writing', processing: 'Processing write...', argKey: 'path', formatArg: 'filename' },
  edit: { running: 'Editing', processing: 'Processing edit...', argKey: 'path', formatArg: 'filename' },
  exec: { running: 'Running command...', processing: 'Processing output...' },
  process: { running: 'Managing process...', processing: 'Processing...' },
  file_save: { running: 'Saving', processing: 'Processing save...', argKey: 'source_path', formatArg: 'filename' },
  file_save_asset: { running: 'Saving asset...', processing: 'Processing asset...', argKey: 'source_path', formatArg: 'filename' },
  file_save_common: { running: 'Saving shared file...', processing: 'Processing save...' },
  file_save_directory: { running: 'Saving directory...', processing: 'Processing save...' },
  file_list: { running: 'Listing session files...', processing: 'Processing file list...' },
  file_list_common: { running: 'Listing shared files...', processing: 'Processing file list...' },
  file_get_session_info: { running: 'Getting session info...', processing: 'Processing info...' },
  file_delete: { running: 'Deleting', processing: 'Processing delete...', argKey: 'filename', formatArg: 'filename' },

  // Web & Browser
  web_search: { running: 'Searching', processing: 'Processing results...', argKey: 'query', formatArg: 'query' },
  web_fetch: { running: 'Fetching', processing: 'Processing content...', argKey: 'url', formatArg: 'domain' },
  browser: { running: 'Using browser...', processing: 'Processing browser...', argKey: '_browser_action' },

  // Memory
  memory_search: { running: 'Searching memory for', processing: 'Processing results...', argKey: 'query', formatArg: 'query' },
  memory_get: { running: 'Retrieving memory...', processing: 'Processing memory...' },

  // Config & Services
  config_read: { running: 'Reading config...', processing: 'Processing config...' },
  config_update: { running: 'Updating config...', processing: 'Processing update...' },
  config_set_env: { running: 'Setting environment...', processing: 'Processing env...' },
  config_add_channel: { running: 'Adding channel...', processing: 'Processing channel...' },
  config_schema: { running: 'Getting config schema...', processing: 'Processing schema...' },
  service_status: { running: 'Checking service status...', processing: 'Processing status...' },

  // Scheduling & Messaging
  cron: { running: 'Managing schedule...', processing: 'Processing schedule...' },
  message: { running: 'Sending message...', processing: 'Processing message...' },
  tts: { running: 'Generating speech...', processing: 'Processing audio...' },

  // Sessions & Agents
  sessions_list: { running: 'Listing sessions...', processing: 'Processing sessions...' },
  sessions_history: { running: 'Getting session history...', processing: 'Processing history...' },
  sessions_send: { running: 'Sending to session...', processing: 'Processing response...' },
  sessions_yield: { running: 'Yielding to session...', processing: 'Processing yield...' },
  sessions_spawn: { running: 'Spawning session...', processing: 'Processing spawn...' },
  subagents: { running: 'Managing sub-agents...', processing: 'Processing agents...' },
  session_status: { running: 'Getting session status...', processing: 'Processing status...' },
  agents_list: { running: 'Listing agents...', processing: 'Processing agents...' },

  // Nodes & Canvas
  nodes: { running: 'Interacting with device...', processing: 'Processing device...' },
  canvas: { running: 'Updating canvas...', processing: 'Processing canvas...' },

  // Date resolution
  date_resolver: { running: 'Resolving date...', processing: 'Processing date...', argKey: 'expression', formatArg: 'query' },
};

export const BROWSER_ACTION_DISPLAY: Record<string, { running: string; processing: string }> = {
  open: { running: 'Opening', processing: 'Browser: Loading page...' },
  navigate: { running: 'Navigating to', processing: 'Browser: Loading page...' },
  snapshot: { running: 'Browser: Taking snapshot...', processing: 'Browser: Processing snapshot...' },
  screenshot: { running: 'Browser: Taking screenshot...', processing: 'Browser: Processing screenshot...' },
  console: { running: 'Browser: Executing script...', processing: 'Browser: Processing script...' },
  click: { running: 'Browser: Clicking element...', processing: 'Browser: Processing click...' },
  type: { running: 'Browser: Typing text...', processing: 'Browser: Processing input...' },
  scroll: { running: 'Browser: Scrolling page...', processing: 'Browser: Processing scroll...' },
  hover: { running: 'Browser: Hovering element...', processing: 'Browser: Processing hover...' },
  wait: { running: 'Browser: Waiting...', processing: 'Browser: Processing wait...' },
  close: { running: 'Browser: Closing tab...', processing: 'Browser: Processing close...' },
  back: { running: 'Browser: Going back...', processing: 'Browser: Processing navigation...' },
  forward: { running: 'Browser: Going forward...', processing: 'Browser: Processing navigation...' },
  refresh: { running: 'Browser: Refreshing page...', processing: 'Browser: Processing refresh...' },
  tabs: { running: 'Browser: Listing tabs...', processing: 'Browser: Processing tabs...' },
  pdf: { running: 'Browser: Generating PDF...', processing: 'Browser: Processing PDF...' },
};

export const THINKING_MESSAGES = [
  'Running tools...',
  'Performing actions...',
  'Executing tasks...',
  'Executing tool calls...',
  'Running agent tasks...',
];

export function getRandomThinkingMessage(): string {
  return THINKING_MESSAGES[Math.floor(Math.random() * THINKING_MESSAGES.length)];
}
