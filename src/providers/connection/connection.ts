/**
 * Connection - Connection/provisioning state machine.
 *
 * Replaces the extension's ConnectionManager (background script) with a
 * browser-side service that uses direct fetch + IStorageProvider.
 *
 * State machine (1:1 with extension):
 *   null → CONNECTING → READY | CONNECTED | ERROR | UNAUTHORIZED
 *   CONNECTING → provisioning loop → READY | ERROR
 *   CONNECTED → USER_PROCEED → READY
 *
 * Capabilities matched from extension:
 *   - Auth token retrieval via IAuthRepository
 *   - Onboarded flag persistence via IStorageProvider
 *   - Session-scoped state persistence via sessionStorage
 *   - Status endpoint: GET /api/neoclaw-agent/status (agentConnected + authOk)
 *   - Quick health check (single status call, 10s timeout)
 *   - Full connecting phase (3 retries, 10s intervals, 30s per-request timeout)
 *   - Instance stability verification (2 consecutive successes, 1s apart)
 *   - Provisioning loop polling status, 5 min max
 *   - 403 handling (invite vs generic error)
 *   - AbortController per flow, flow ID tracking
 *   - Subscriber-based state dispatch
 *
 * Legacy ping via POST /v1/responses is preserved (deprecated) for rollback.
 *
 * Dropped (extension-only, N/A for web):
 *   - chrome.runtime.Port communication
 *   - chrome.storage.session (replaced by sessionStorage)
 *   - chrome.storage.local (replaced by IStorageProvider)
 */

import type { IAuthRepository, IStorageProvider } from '@/types';
import type { ConnectionState, ConnectionMeta } from '@/types';
import type { GatewayTransport } from '@/providers/transport/gateway-transport';
import { GATEWAY_ENDPOINTS } from '@/providers/transport/gateway-endpoints';
import { fetchWithRetry } from '@/providers/transport/fetch-with-retry.util';
import type { RetryResult } from '@/providers/transport/fetch-with-retry.util';

const INVITE_ERROR_MSG = 'User not authorized with invite';

const CONNECTING_MAX_ATTEMPTS = 3;
const CONNECTING_INTERVAL_MS = 10_000;
const REQUEST_TIMEOUT_MS = 30_000;
const FAST_PING_TIMEOUT_MS = 10_000;
const PROVISIONING_MAX_DURATION_MS = 5 * 60 * 1000;
const PROVISIONING_DEFAULT_INTERVAL_MS = 10_000;
const VERIFY_REQUIRED_SUCCESSES = 2;
const VERIFY_INTERVAL_MS = 1_000;

const ONBOARDED_KEY_PREFIX = 'neoclaw_onboarded:';
const SESSION_STATE_KEY = 'neoclaw_connection_state';

/** @deprecated Kept for rollback / other consumers. Use AGENT_STATUS endpoint instead. */
const PING_BODY = JSON.stringify({ model: 'openclaw', input: 'ping' });

export interface ConnectionUpdateHandler {
  onUpdate: (state: ConnectionState, meta?: ConnectionMeta) => void;
}

interface StatusResponse {
  agentConnected: boolean;
  authOk: boolean;
  uptimeMs?: number;
  lastMessageAgeMs?: number;
}

type HealthCheckResult =
  | { outcome: 'ready' }
  | { outcome: 'provisioning'; body?: string }
  | { outcome: 'terminal' }
  | { outcome: 'fallback' };

type PingOutcome =
  | { action: 'done' }
  | { action: 'provisioning'; body?: string }
  | { action: 'continue' }
  | { action: 'aborted' };

interface FlowContext {
  flowId: string;
  abortSignal: AbortSignal;
  isActive: () => boolean;
  sendUpdate: (state: ConnectionState, meta?: ConnectionMeta) => void;
  sleepWithAbort: (ms: number) => Promise<void>;
}

interface PersistedState {
  state: string;
  phase?: string;
  flowId: string;
  provisioningStartMs?: number;
  lastBody?: string;
}

export class Connection {
  private abortController: AbortController | null = null;
  private activeFlowId: string | null = null;
  private subscribers = new Set<ConnectionUpdateHandler>();

  constructor(
    private gateway: GatewayTransport,
    private authProvider: IAuthRepository,
    private storageProvider: IStorageProvider,
  ) {}

  subscribe(handler: ConnectionUpdateHandler): () => void {
    this.subscribers.add(handler);
    return () => {
      this.subscribers.delete(handler);
    };
  }

  start(): void {
    this.abortActiveFlow();
    this.startFlow();
  }

  retry(): void {
    this.abortActiveFlow();
    this.startFlow();
  }

  resume(): void {
    this.abortActiveFlow();
    this.resumeFlow();
  }

  proceed(): void {
    this.handleUserProceed();
  }

  stop(): void {
    this.abortActiveFlow();
  }

  // ── Flow orchestration ──

  private abortActiveFlow(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private createFlowContext(): FlowContext {
    const flowId = crypto.randomUUID();
    this.activeFlowId = flowId;
    this.abortController = new AbortController();

    return {
      flowId,
      abortSignal: this.abortController.signal,
      isActive: () => this.activeFlowId === flowId && !this.abortController?.signal.aborted,
      sendUpdate: (state, meta) => this.dispatchUpdate(state, meta),
      sleepWithAbort: (ms) => this.sleepWithAbort(ms),
    };
  }

  private async startFlow(): Promise<void> {
    const ctx = this.createFlowContext();
    ctx.sendUpdate('CONNECTING', { phase: 'connecting' });

    let userId: string | undefined;
    try {
      const authState = await this.authProvider.getAuthState();
      userId = authState.sub ?? authState.email;
    } catch {
      ctx.sendUpdate('ERROR', {
        errorMessage: 'Unable to verify authentication.',
        errorOrigin: 'connecting',
      });
      return;
    }

    const onboarded = await this.checkOnboardedFlag(userId);

    if (onboarded) {
      const health = await this.runQuickHealthCheck(ctx);
      if (!ctx.isActive()) return;

      switch (health.outcome) {
        case 'ready':
          this.persistSessionState({ state: 'READY', flowId: ctx.flowId });
          ctx.sendUpdate('READY');
          this.clearSessionState();
          return;

        case 'provisioning': {
          const startMs = Date.now();
          this.persistSessionState({
            state: 'CONNECTING',
            phase: 'provisioning',
            flowId: ctx.flowId,
            provisioningStartMs: startMs,
            lastBody: health.body,
          });
          ctx.sendUpdate('CONNECTING', { phase: 'provisioning' });
          await this.runProvisioningPhase(ctx, startMs, health.body);
          return;
        }

        case 'terminal':
          return;

        case 'fallback':
          break;
      }
    }

    await this.runConnectingPhase(ctx);
  }

  private async resumeFlow(): Promise<void> {
    const persisted = this.readSessionState();

    if (persisted?.phase === 'provisioning' && persisted.provisioningStartMs) {
      const elapsed = Date.now() - persisted.provisioningStartMs;
      if (elapsed >= PROVISIONING_MAX_DURATION_MS) {
        this.clearSessionState();
        this.dispatchUpdate('ERROR', {
          errorMessage: 'Provisioning timed out.',
          errorOrigin: 'provisioning',
        });
        return;
      }

      const ctx = this.createFlowContext();
      ctx.sendUpdate('CONNECTING', { phase: 'provisioning' });
      await this.runProvisioningPhase(ctx, persisted.provisioningStartMs, persisted.lastBody);
      return;
    }

    await this.startFlow();
  }

  private async handleUserProceed(): Promise<void> {
    let userId: string | undefined;
    try {
      const authState = await this.authProvider.getAuthState();
      userId = authState.sub ?? authState.email;
    } catch {
      this.dispatchUpdate('READY');
      return;
    }
    await this.writeOnboardedFlag(userId);
    this.dispatchUpdate('READY');
  }

  // ── Connecting phase ──

  private async runConnectingPhase(ctx: FlowContext): Promise<void> {
    if (!ctx.isActive()) return;

    let userId: string | undefined;
    try {
      const authState = await this.authProvider.getAuthState();
      userId = authState.sub ?? authState.email;
    } catch {
      ctx.sendUpdate('ERROR', {
        errorMessage: 'Unable to verify authentication.',
        errorOrigin: 'connecting',
      });
      return;
    }

    const { url, init } = await this.prepareStatusRequest();

    const result = await fetchWithRetry(url, init, {
      maxAttempts: CONNECTING_MAX_ATTEMPTS,
      intervalMs: CONNECTING_INTERVAL_MS,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
      isRetryable: (s: number) => s >= 500 || s === 404,
      abortSignal: ctx.abortSignal,
      onAttempt: (attempt: number) => {
        if (ctx.isActive()) {
          ctx.sendUpdate('CONNECTING', {
            phase: 'connecting',
            attempt,
            maxAttempts: CONNECTING_MAX_ATTEMPTS,
          });
        }
      },
    });

    if (!ctx.isActive()) return;

    const outcome = await this.processStatusResult(ctx, result, userId, 'connecting');

    if (outcome.action === 'provisioning') {
      const provisioningStartMs = Date.now();
      this.persistSessionState({
        state: 'CONNECTING',
        phase: 'provisioning',
        flowId: ctx.flowId,
        provisioningStartMs,
        lastBody: outcome.body,
      });
      ctx.sendUpdate('CONNECTING', { phase: 'provisioning' });
      await this.runProvisioningPhase(ctx, provisioningStartMs, outcome.body);
      return;
    }

    if (outcome.action === 'continue') {
      ctx.sendUpdate('ERROR', {
        errorMessage: "We couldn't reach the backend. Please check your connection and try again.",
        errorOrigin: 'connecting',
      });
    }
  }

  // ── Health check ──

  private async runQuickHealthCheck(
    ctx: FlowContext,
  ): Promise<HealthCheckResult> {
    const { url, init } = await this.prepareStatusRequest();

    const result = await fetchWithRetry(url, init, {
      maxAttempts: 1,
      intervalMs: 0,
      requestTimeoutMs: FAST_PING_TIMEOUT_MS,
      isRetryable: () => false,
      abortSignal: ctx.abortSignal,
    });

    if (!ctx.isActive() || result.reason === 'aborted') return { outcome: 'terminal' };

    if (result.status === 403) {
      this.handle403(ctx, result.body);
      return { outcome: 'terminal' };
    }

    if (result.status === 202) return { outcome: 'provisioning', body: result.body };

    if (result.ok) {
      const status = this.parseStatusBody(result.body);
      if (this.isStatusReady(status)) return { outcome: 'ready' };
      return { outcome: 'provisioning' };
    }

    return { outcome: 'fallback' };
  }

  // ── Provisioning phase ──

  private async runProvisioningPhase(
    ctx: FlowContext,
    provisioningStartMs: number,
    lastBody?: string,
  ): Promise<void> {
    let currentBody = lastBody;

    while (ctx.isActive()) {
      if (Date.now() - provisioningStartMs >= PROVISIONING_MAX_DURATION_MS) {
        ctx.sendUpdate('ERROR', {
          errorMessage: "We couldn't connect to the backend. Please try again.",
          errorOrigin: 'provisioning',
        });
        return;
      }

      const { status, waitMs } = this.parseProvisioningBody(currentBody);
      ctx.sendUpdate('CONNECTING', {
        phase: 'provisioning',
        provisioningStatus: status as 'QUEUED' | 'SPAWNING' | undefined,
      });

      try {
        await ctx.sleepWithAbort(waitMs);
      } catch {
        return;
      }

      if (!ctx.isActive()) return;

      let userId: string | undefined;
      try {
        const authState = await this.authProvider.getAuthState();
        userId = authState.sub ?? authState.email;
      } catch {
        continue;
      }

      const { url, init } = await this.prepareStatusRequest();
      const result = await fetchWithRetry(url, init, {
        maxAttempts: 1,
        intervalMs: 0,
        requestTimeoutMs: REQUEST_TIMEOUT_MS,
        isRetryable: () => false,
        abortSignal: ctx.abortSignal,
      });

      const outcome = await this.processStatusResult(ctx, result, userId, 'provisioning');

      if (outcome.action === 'done' || outcome.action === 'aborted') return;

      if (outcome.action === 'provisioning') {
        currentBody = result.body;
        this.persistSessionState({
          state: 'CONNECTING',
          phase: 'provisioning',
          flowId: ctx.flowId,
          provisioningStartMs,
          lastBody: result.body,
        });
        continue;
      }

      currentBody = undefined;
    }
  }

  // ── Verification phase ──

  private async verifyInstanceStable(ctx: FlowContext): Promise<boolean> {
    for (let i = 0; i < VERIFY_REQUIRED_SUCCESSES; i++) {
      if (!ctx.isActive()) return false;

      try {
        await ctx.sleepWithAbort(VERIFY_INTERVAL_MS);
      } catch {
        return false;
      }

      if (!ctx.isActive()) return false;

      const { url, init } = await this.prepareStatusRequest();
      const result = await fetchWithRetry(url, init, {
        maxAttempts: CONNECTING_MAX_ATTEMPTS,
        intervalMs: CONNECTING_INTERVAL_MS,
        requestTimeoutMs: REQUEST_TIMEOUT_MS,
        isRetryable: (s: number) => s >= 500 || s === 404,
        abortSignal: ctx.abortSignal,
      });

      if (!ctx.isActive()) return false;
      if (result.reason === 'aborted') return false;
      if (!result.ok) return false;

      const status = this.parseStatusBody(result.body);
      if (!this.isStatusReady(status)) return false;
    }
    return true;
  }

  // ── Ping result processing (deprecated — kept for rollback / other consumers) ──

  /** @deprecated Use processStatusResult() instead. */
  private async processPingResult(
    ctx: FlowContext,
    result: RetryResult,
    userId: string | undefined,
    errorOrigin: 'connecting' | 'provisioning',
  ): Promise<PingOutcome> {
    if (result.reason === 'aborted' || !ctx.isActive()) {
      return { action: 'aborted' };
    }

    if (result.status === 202) {
      return { action: 'provisioning', body: result.body };
    }

    if (result.ok) {
      const onboarded = await this.checkOnboardedFlag(userId);
      if (!onboarded) {
        ctx.sendUpdate('CONNECTING', { phase: 'verifying' });
        const stable = await this.verifyInstanceStable(ctx);
        if (!ctx.isActive()) return { action: 'aborted' };
        if (!stable) {
          ctx.sendUpdate('ERROR', {
            errorMessage: 'Instance is not yet stable. Please try again.',
            errorOrigin,
          });
          return { action: 'done' };
        }
      }
      const nextState: ConnectionState = onboarded ? 'READY' : 'CONNECTED';
      this.persistSessionState({ state: nextState, flowId: ctx.flowId });
      ctx.sendUpdate(nextState);
      this.clearSessionState();
      return { action: 'done' };
    }

    if (result.status === 403) {
      this.handle403(ctx, result.body);
      return { action: 'done' };
    }

    return { action: 'continue' };
  }

  private handle403(ctx: FlowContext, body?: string): void {
    let message = '';
    if (body) {
      try {
        const parsed = JSON.parse(body);
        message = parsed.message ?? '';
      } catch {
        /* not JSON */
      }
    }

    if (message === INVITE_ERROR_MSG) {
      ctx.sendUpdate('UNAUTHORIZED');
    } else {
      ctx.sendUpdate('ERROR', {
        errorMessage: 'Error connecting to the backend. Please try again.',
        errorOrigin: 'connecting',
      });
    }
  }

  // ── Status check helpers ──

  private parseProvisioningStatus(body?: string): 'QUEUED' | 'SPAWNING' | undefined {
    if (!body) return undefined;
    try {
      const parsed = JSON.parse(body);
      const s = parsed.status;
      if (s === 'QUEUED' || s === 'SPAWNING') return s;
      return undefined;
    } catch {
      return undefined;
    }
  }

  private async prepareStatusRequest(): Promise<{ url: string; init: RequestInit }> {
    return this.gateway.prepareRequest(GATEWAY_ENDPOINTS.AGENT_STATUS, {
      method: 'GET',
    });
  }

  private parseStatusBody(body?: string): StatusResponse | null {
    if (!body) return null;
    try {
      return JSON.parse(body) as StatusResponse;
    } catch {
      return null;
    }
  }

  private isStatusReady(status: StatusResponse | null): boolean {
    return !!status?.agentConnected && !!status?.authOk;
  }

  private async processStatusResult(
    ctx: FlowContext,
    result: RetryResult,
    userId: string | undefined,
    errorOrigin: 'connecting' | 'provisioning',
  ): Promise<PingOutcome> {
    if (result.reason === 'aborted' || !ctx.isActive()) {
      return { action: 'aborted' };
    }

    if (result.status === 202) {
      return { action: 'provisioning', body: result.body };
    }

    if (result.status === 403) {
      this.handle403(ctx, result.body);
      return { action: 'done' };
    }

    if (result.ok) {
      const status = this.parseStatusBody(result.body);
      if (!this.isStatusReady(status)) {
        return { action: 'provisioning' };
      }

      const onboarded = await this.checkOnboardedFlag(userId);
      if (!onboarded) {
        ctx.sendUpdate('CONNECTING', { phase: 'verifying' });
        const stable = await this.verifyInstanceStable(ctx);
        if (!ctx.isActive()) return { action: 'aborted' };
        if (!stable) {
          ctx.sendUpdate('ERROR', {
            errorMessage: 'Instance is not yet stable. Please try again.',
            errorOrigin,
          });
          return { action: 'done' };
        }
      }
      const nextState: ConnectionState = onboarded ? 'READY' : 'CONNECTED';
      this.persistSessionState({ state: nextState, flowId: ctx.flowId });
      ctx.sendUpdate(nextState);
      this.clearSessionState();
      return { action: 'done' };
    }

    return { action: 'continue' };
  }

  // ── Ping helpers (deprecated — kept for rollback / other consumers) ──

  /** @deprecated Use prepareStatusRequest() instead. */
  private async preparePing(): Promise<{ url: string; init: RequestInit }> {
    return this.gateway.prepareRequest(GATEWAY_ENDPOINTS.CHAT, {
      method: 'POST',
      body: PING_BODY,
    });
  }

  private parseProvisioningBody(body?: string): { status?: string; waitMs: number } {
    if (!body) return { waitMs: PROVISIONING_DEFAULT_INTERVAL_MS };
    try {
      const parsed = JSON.parse(body);
      const waitMs =
        typeof parsed.retryAfterSeconds === 'number' && parsed.retryAfterSeconds > 0
          ? parsed.retryAfterSeconds * 1000
          : PROVISIONING_DEFAULT_INTERVAL_MS;
      return { status: parsed.status, waitMs };
    } catch {
      return { waitMs: PROVISIONING_DEFAULT_INTERVAL_MS };
    }
  }

  // ── Onboarded flag (replaces chrome.storage.local) ──

  private async checkOnboardedFlag(userId: string | undefined): Promise<boolean> {
    if (!userId) return false;
    const key = ONBOARDED_KEY_PREFIX + userId;
    const data = await this.storageProvider.get<{ onboarded?: boolean }>(key, {});
    return !!data?.onboarded;
  }

  private async writeOnboardedFlag(userId: string | undefined): Promise<void> {
    if (!userId) return;
    const key = ONBOARDED_KEY_PREFIX + userId;
    await this.storageProvider.set(key, { onboarded: true, timestamp: Date.now(), userId });
  }

  // ── Session state persistence (replaces chrome.storage.session) ──

  private persistSessionState(state: Partial<PersistedState>): void {
    try {
      sessionStorage.setItem(SESSION_STATE_KEY, JSON.stringify(state));
    } catch {
      /* sessionStorage may not be available */
    }
  }

  private readSessionState(): PersistedState | null {
    try {
      const raw = sessionStorage.getItem(SESSION_STATE_KEY);
      return raw ? (JSON.parse(raw) as PersistedState) : null;
    } catch {
      return null;
    }
  }

  private clearSessionState(): void {
    try {
      sessionStorage.removeItem(SESSION_STATE_KEY);
    } catch {
      /* ignore */
    }
  }

  // ── Dispatch + sleep ──

  private dispatchUpdate(state: ConnectionState, meta?: ConnectionMeta): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber.onUpdate(state, meta);
      } catch (err) {
        console.error('[Connection] Subscriber error:', err);
      }
    }
  }

  private sleepWithAbort(ms: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.abortController?.signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      const timer = setTimeout(resolve, ms);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      this.abortController?.signal.addEventListener('abort', onAbort, { once: true });
    });
  }
}
