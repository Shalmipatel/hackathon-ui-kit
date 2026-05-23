import React from 'react';
import type { ToolCategory, ActiveToolInfo } from '../../types';
import { TOOL_DISPLAY_CONFIG, BROWSER_ACTION_DISPLAY } from './toolConfig';
import { formatArgValue, extractDomain, truncateText, TOOL_DISPLAY_MAX_LENGTH } from '../../utils';

export function getToolCategory(toolName: string): ToolCategory {
  const name = toolName.toLowerCase();

  // Terminal/exec commands
  if (['exec', 'process'].includes(name)) {
    return 'terminal';
  }
  // File operations
  if (['read', 'write', 'edit'].includes(name) || name.startsWith('file_')) {
    return 'file';
  }
  // Web search
  if (name === 'web_search') {
    return 'search';
  }
  // Web fetch/browser
  if (
    ['web_fetch', 'browser'].includes(name) ||
    name.startsWith('web_') ||
    name.startsWith('browser')
  ) {
    return 'web';
  }
  // Memory
  if (name.startsWith('memory_')) {
    return 'memory';
  }
  // Config/services
  if (name.startsWith('config_') || name.startsWith('service_')) {
    return 'config';
  }
  // Messaging
  if (name === 'message') {
    return 'message';
  }
  // Text-to-speech
  if (name === 'tts') {
    return 'tts';
  }
  // Scheduling (cron only now)
  if (name === 'cron') {
    return 'schedule';
  }
  // Sessions/agents
  if (
    name.startsWith('sessions_') ||
    name.startsWith('subagent') ||
    name.startsWith('agents_') ||
    name === 'session_status'
  ) {
    return 'session';
  }
  // Canvas/nodes
  if (['nodes', 'canvas'].includes(name)) {
    return 'canvas';
  }
  return 'default';
}

export const ToolIcons: Record<ToolCategory, React.ReactNode> = {
  file: React.createElement(
    'svg',
    {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '2',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    React.createElement('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
    React.createElement('polyline', { points: '14 2 14 8 20 8' })
  ),
  terminal: React.createElement(
    'svg',
    {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '2',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    React.createElement('polyline', { points: '4 17 10 11 4 5' }),
    React.createElement('line', { x1: '12', y1: '19', x2: '20', y2: '19' })
  ),
  search: React.createElement(
    'svg',
    {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '2',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    React.createElement('circle', { cx: '11', cy: '11', r: '8' }),
    React.createElement('line', { x1: '21', y1: '21', x2: '16.65', y2: '16.65' })
  ),
  web: React.createElement(
    'svg',
    {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '2',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    React.createElement('circle', { cx: '12', cy: '12', r: '10' }),
    React.createElement('line', { x1: '2', y1: '12', x2: '22', y2: '12' }),
    React.createElement('path', {
      d: 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
    })
  ),
  memory: React.createElement(
    'svg',
    {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '2',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    React.createElement('ellipse', { cx: '12', cy: '5', rx: '9', ry: '3' }),
    React.createElement('path', { d: 'M21 12c0 1.66-4 3-9 3s-9-1.34-9-3' }),
    React.createElement('path', { d: 'M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5' })
  ),
  config: React.createElement(
    'svg',
    {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '2',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    React.createElement('circle', { cx: '12', cy: '12', r: '3' }),
    React.createElement('path', {
      d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z',
    })
  ),
  schedule: React.createElement(
    'svg',
    {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '2',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    React.createElement('circle', { cx: '12', cy: '12', r: '10' }),
    React.createElement('polyline', { points: '12 6 12 12 16 14' })
  ),
  message: React.createElement(
    'svg',
    {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '2',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    React.createElement('path', { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' })
  ),
  tts: React.createElement(
    'svg',
    {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '2',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    React.createElement('polygon', { points: '11 5 6 9 2 9 2 15 6 15 11 19 11 5' }),
    React.createElement('path', { d: 'M15.54 8.46a5 5 0 0 1 0 7.07' }),
    React.createElement('path', { d: 'M19.07 4.93a10 10 0 0 1 0 14.14' })
  ),
  session: React.createElement(
    'svg',
    {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '2',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    React.createElement('path', { d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' }),
    React.createElement('circle', { cx: '9', cy: '7', r: '4' }),
    React.createElement('path', { d: 'M23 21v-2a4 4 0 0 0-3-3.87' }),
    React.createElement('path', { d: 'M16 3.13a4 4 0 0 1 0 7.75' })
  ),
  canvas: React.createElement(
    'svg',
    {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '2',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    React.createElement('rect', { x: '3', y: '3', width: '18', height: '18', rx: '2', ry: '2' }),
    React.createElement('line', { x1: '3', y1: '9', x2: '21', y2: '9' }),
    React.createElement('line', { x1: '9', y1: '21', x2: '9', y2: '9' })
  ),
  default: null,
};

export function getBrowserDisplayText(tool: ActiveToolInfo): string {
  const action = tool.args?.action as string | undefined;
  const url = tool.args?.url as string | undefined;

  const actionConfig = action ? BROWSER_ACTION_DISPLAY[action] : undefined;

  if (tool.status === 'processing') {
    return actionConfig?.processing ?? 'Browser: Processing...';
  }

  // For 'open' and 'navigate' actions with URL, show the domain
  if ((action === 'open' || action === 'navigate') && url) {
    const domain = extractDomain(url);
    const prefix = action === 'open' ? 'Browser: Opening' : 'Browser: Navigating to';
    return `${prefix} ${truncateText(domain, TOOL_DISPLAY_MAX_LENGTH)}...`;
  }

  return actionConfig?.running ?? 'Browser: Working...';
}

export function getToolDisplayText(tool: ActiveToolInfo): string {
  // Special handling for browser tool
  if (tool.name === 'browser') {
    return getBrowserDisplayText(tool);
  }

  const config = TOOL_DISPLAY_CONFIG[tool.name];

  if (!config) {
    return tool.status === 'processing'
      ? `Processing ${tool.name}...`
      : `Running ${tool.name}...`;
  }

  if (tool.status === 'processing') {
    return config.processing;
  }

  // For running status, check if we have an argument to display
  if (config.argKey && config.formatArg && tool.args) {
    const argValue = tool.args[config.argKey];
    if (typeof argValue === 'string' && argValue) {
      const formatted = formatArgValue(argValue, config.formatArg);
      return `${config.running} ${formatted}...`;
    }
  }

  return config.running.endsWith('...') ? config.running : `${config.running}...`;
}
