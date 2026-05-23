export class TransportError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`HTTP ${status}: ${body.slice(0, 200)}`);
    this.name = 'TransportError';
  }
}

export class AuthExpiredError extends Error {
  constructor(message = 'Authentication expired') {
    super(message);
    this.name = 'AuthExpiredError';
  }
}

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | Record<string, unknown>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface PreparedRequest {
  url: string;
  init: RequestInit;
}
