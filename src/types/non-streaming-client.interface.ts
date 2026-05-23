/**
 * Interface for non-streaming LLM requests.
 * Used for synchronous operations like title generation, health checks.
 */

export interface INonStreamingClient {
  /**
   * Execute a non-streaming LLM request.
   * @param payload - The request configuration
   * @returns The response content as a string
   */
  request(payload: NonStreamingRequest): Promise<string>;
}

export interface NonStreamingRequest {
  /** Messages to send to the LLM */
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  /** Optional session key for server-side tracking */
  sessionKey?: string;
  /** Optional timeout override in milliseconds */
  timeout?: number;
}
