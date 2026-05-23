/**
 * SSE parser for the Agent API event format.
 * Parses OpenClaw WS events passed through as SSE from the Platform Service.
 *
 * Event format:
 *   event: <eventName>
 *   data: <JSON payload>
 *
 * Text streaming uses "agent" events with stream: "assistant" and data.delta
 * (NOT "chat" events which contain full accumulated text)
 */

export interface AgentSSEParserCallbacks {
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
  onEvent: (eventType: string, data: Record<string, unknown>) => void;
}

export interface AgentSSEParser {
  feed: (raw: string) => void;
}

export function createAgentSSEParser(callbacks: AgentSSEParserCallbacks): AgentSSEParser {
  const { onDelta, onDone, onError, onEvent } = callbacks;
  let buffer = '';
  let currentEvent = '';
  let toolJustCompleted = false; // Track when we need a newline before next text

  return {
    feed(raw: string) {
      buffer += raw;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed) {
          currentEvent = '';
          continue;
        }

        if (trimmed.startsWith(':')) {
          continue;
        }

        if (trimmed.startsWith('event:')) {
          currentEvent = trimmed.slice(6).trim();
          continue;
        }

        if (trimmed.startsWith('data:')) {
          const data = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed.slice(5);

          if (data === '[DONE]') {
            onDone();
            return;
          }

          let parsed: Record<string, unknown> | null = null;
          try {
            parsed = JSON.parse(data);
          } catch {
            continue;
          }
          if (!parsed) continue;

          const eventType = currentEvent || 'unknown';

          // Always forward the raw event for tool events, etc.
          onEvent(eventType, parsed);

          // Handle agent events - this is where text streaming and tool events come from
          if (eventType === 'agent') {
            const stream = parsed.stream as string | undefined;
            const agentData = parsed.data as Record<string, unknown> | undefined;

            // Text streaming via agent events with stream: "assistant"
            if (stream === 'assistant' && agentData) {
              const delta = agentData.delta as string | undefined;
              if (delta) {
                // Add newline separator after tool completion
                if (toolJustCompleted) {
                  onDelta('\n\n');
                  toolJustCompleted = false;
                }
                onDelta(delta);
              }
            }

            // Track tool completion for newline insertion
            if (stream === 'tool' && agentData) {
              const phase = agentData.phase as string | undefined;
              if (phase === 'result') {
                toolJustCompleted = true;
              } else if (phase === 'start') {
                // New tool starting, reset the flag
                toolJustCompleted = false;
              }
            }

            // Lifecycle end means done
            if (stream === 'lifecycle' && agentData) {
              const phase = agentData.phase as string | undefined;
              if (phase === 'end') {
                onDone();
                return;
              }
            }
          }

          // Handle chat events for final/error states (not for text - that comes from agent events)
          if (eventType === 'chat') {
            const state = parsed.state as string | undefined;

            if (state === 'final') {
              onDone();
              return;
            } else if (state === 'error') {
              const errorMessage = (parsed.errorMessage as string) || 'Chat error';
              onError(errorMessage);
              return;
            }
          }

          // Handle sessions.changed with abort reason
          if (eventType === 'sessions.changed') {
            const reason = parsed.reason as string | undefined;
            if (reason === 'abort') {
              onDone();
              return;
            }
          }

          // Handle explicit error events
          if (eventType === 'error') {
            const errorMessage = (parsed.error as string) || 'Unknown error';
            onError(errorMessage);
            return;
          }
        }
      }
    },
  };
}
