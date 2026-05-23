/**
 * SSE (Server-Sent Events) line buffer parser.
 * Parses raw SSE chunks and emits typed callbacks.
 */

export interface SSEParserCallbacks {
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

export interface SSEParser {
  feed: (raw: string) => void;
}

export function createSSEParser(callbacks: SSEParserCallbacks): SSEParser {
  const { onDelta, onDone, onError } = callbacks;
  let buffer = '';
  let currentEvent = '';

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
        if (trimmed.startsWith(':')) continue;

        if (trimmed.startsWith('event: ')) {
          currentEvent = trimmed.slice(7).trim();
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

          const eventType = currentEvent || (parsed.type as string | undefined) || '';

          if (eventType === 'response.output_text.delta' && parsed.delta) {
            onDelta(parsed.delta as string);
          }
          if (eventType === 'response.failed') {
            const errorObj = parsed.error as Record<string, unknown> | undefined;
            const responseObj = parsed.response as Record<string, unknown> | undefined;
            const responseError = responseObj?.error as Record<string, unknown> | undefined;
            const msg =
              (errorObj?.message as string | undefined) ??
              (responseError?.message as string | undefined) ??
              'Response failed';
            onError(msg);
            return;
          }
          if (eventType === 'response.completed') {
            onDone();
            return;
          }
        }
      }
    },
  };
}
