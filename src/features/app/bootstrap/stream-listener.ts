/**
 * Stream event listener setup.
 * Connects StreamClient events to the Zustand store actions.
 */

import type { ChatStore } from '@/store/chat-store';
import { getStreamClient } from './providers';
import type { StoreApi } from 'zustand';

type ChatStoreApi = StoreApi<ChatStore>;

export function setupStreamListener(storeApi: ChatStoreApi): () => void {
  const streamClient = getStreamClient();

  return streamClient.onEvent((event) => {
    const store = storeApi.getState();
    switch (event.type) {
      case 'chunk':
        store.clearActiveTool(event.sessionId);
        store.appendDelta(event.sessionId, event.content!);
        break;
      case 'done':
        store.clearActiveTool(event.sessionId);
        store.finishStream(event.sessionId);
        break;
      case 'error':
        store.clearActiveTool(event.sessionId);
        store.streamError(event.sessionId, event.error!);
        break;
      case 'aborted':
        store.clearActiveTool(event.sessionId);
        store.finishStream(event.sessionId);
        break;
      case 'retrying':
        break;
      case 'event':
        if (event.event && event.payload) {
          handleWsEvent(store, event.sessionId, event.event, event.payload);
        }
        break;
    }
  });
}

function handleWsEvent(
  store: ChatStore,
  sessionId: string,
  eventType: string,
  payload: Record<string, unknown>,
): void {
  if (eventType === 'agent' && payload?.stream === 'tool') {
    const toolData = payload?.data as Record<string, unknown> | undefined;
    if (!toolData) return;

    const phase = toolData.phase as string | undefined;
    const toolName = String(toolData.name ?? '');
    const toolCallId = String(toolData.toolCallId ?? '');

    if (phase === 'start') {
      store.setActiveTool(sessionId, {
        name: toolName,
        toolCallId,
        meta: toolData.meta as string | undefined,
        args: toolData.args as Record<string, unknown> | undefined,
        status: 'running',
      });
    } else if (phase === 'result') {
      store.setActiveTool(sessionId, {
        name: toolName,
        toolCallId,
        meta: toolData.meta as string | undefined,
        args: toolData.args as Record<string, unknown> | undefined,
        status: 'processing',
      });
    }
  }
}
