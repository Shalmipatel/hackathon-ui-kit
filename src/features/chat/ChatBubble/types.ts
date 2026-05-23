import type { ChatMessage } from '@/types';

export interface ActiveToolInfo {
  name: string;
  toolCallId: string;
  meta?: string;
  args?: Record<string, unknown>;
  status: 'running' | 'processing';
}

export interface ChatBubbleProps {
  message: ChatMessage;
  isLastAssistant?: boolean;
  isStreaming?: boolean;
  onRegenerate?: () => void;
  activeTool?: ActiveToolInfo | null;
}

export type ToolCategory =
  | 'file'
  | 'terminal'
  | 'search'
  | 'web'
  | 'memory'
  | 'config'
  | 'schedule'
  | 'message'
  | 'tts'
  | 'session'
  | 'canvas'
  | 'default';

export interface ToolDisplayConfig {
  running: string;
  processing: string;
  argKey?: string;
  formatArg?: 'filename' | 'domain' | 'query';
}

export interface ExtractedHtmlBlock {
  id: string;
  code: string;
  isComplete: boolean;
  hash: string;
}

export interface ExtractedVioBlock {
  id: string;
  json: string;
  isComplete: boolean;
  hash: string;
}

export interface ExtractedVioFileRef {
  id: string;
  url: string;
  hash: string;
}

export interface ExtractedNeoclawBlock {
  id: string;
  json: string;
  isComplete: boolean;
  hash: string;
}
