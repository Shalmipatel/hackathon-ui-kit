/**
 * Shared transport utilities used by both GatewayTransport and ExternalTransport.
 *
 * Composition over inheritance: pure functions extracted from GatewayTransport
 * to eliminate duplication without coupling the two transports via a base class.
 */

import type { RequestOptions } from './transport.types';

/**
 * Build standard Bearer-token + Content-Type headers.
 * Gateway-specific headers (agent-id, fallback IP) are NOT included;
 * GatewayTransport layers those on top after calling this.
 */
export function buildBearerHeaders(
  token: string | undefined,
  options?: Pick<RequestOptions, 'headers' | 'body'>,
): Record<string, string> {
  const headers: Record<string, string> = {};

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const isFormData = typeof FormData !== 'undefined' && options?.body instanceof FormData;
  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  if (options?.headers) {
    Object.assign(headers, options.headers);
  }

  return headers;
}

/**
 * Serialize a request body for fetch().
 * Passes through native BodyInit types; JSON-stringifies plain objects
 * when Content-Type is application/json.
 */
export function serializeBody(
  body: RequestOptions['body'] | undefined,
  headers: Record<string, string>,
): BodyInit | undefined {
  if (body === undefined || body === null) return undefined;

  if (
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    body instanceof ReadableStream ||
    typeof body === 'string'
  ) {
    return body as BodyInit;
  }

  if (headers['Content-Type'] === 'application/json' && typeof body === 'object') {
    return JSON.stringify(body);
  }

  return body as BodyInit;
}
