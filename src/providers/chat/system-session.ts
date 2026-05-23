/**
 * SystemSession - Facade for internal application operations.
 * Routes operations to the appropriate client (NonStreamingClient for sync ops).
 * Handles errors gracefully with safe defaults.
 */

import type {
  ISystemSession,
  SystemOperation,
  SystemOperationType,
  SystemOperationResult,
  INonStreamingClient,
  GenerateTitleOperation,
  ReformatNotificationOperation,
  UpdateTimezoneOperation,
  UpdateLocationOperation,
  UserPreferencesOperation,
  ConnectionPreference,
} from '@/types';
import { SYSTEM_SESSION_KEY_PREFIX } from '@/types';

export class SystemSession implements ISystemSession {
  constructor(private nonStreamingClient: INonStreamingClient) {}

  async execute<T extends SystemOperationType>(
    operation: SystemOperation & { type: T }
  ): Promise<SystemOperationResult<T>> {
    console.log('[SystemSession] execute called:', { type: operation.type });
    try {
      switch (operation.type) {
        case 'generate_title': {
          const op = operation as GenerateTitleOperation;
          console.log('[SystemSession] generating title for session:', op.sessionId);
          return this.generateTitle(
            op.userMessage,
            op.sessionId
          ) as Promise<SystemOperationResult<T>>;
        }

        case 'health_check':
          return this.healthCheck() as Promise<SystemOperationResult<T>>;

        case 'reformat_notification': {
          const op = operation as ReformatNotificationOperation;
          return this.reformatNotification(
            op.rawResponse,
          ) as Promise<SystemOperationResult<T>>;
        }

        case 'update_timezone': {
          const op = operation as UpdateTimezoneOperation;
          return this.updateTimezone(op.timezone) as Promise<SystemOperationResult<T>>;
        }

        case 'update_location': {
          const op = operation as UpdateLocationOperation;
          return this.updateLocation(op.location) as Promise<SystemOperationResult<T>>;
        }

        case 'user_preferences': {
          const op = operation as UserPreferencesOperation;
          return this.syncUserPreferences(op.payload) as Promise<SystemOperationResult<T>>;
        }

        default: {
          const exhaustiveCheck: never = operation.type;
          throw new Error(`Unknown operation type: ${exhaustiveCheck}`);
        }
      }
    } catch (error) {
      console.warn(`[SystemSession] ${operation.type} failed:`, error);
      return this.getDefaultResult(operation.type) as unknown as SystemOperationResult<T>;
    }
  }

  private async generateTitle(userMessage: string, sessionId: string): Promise<string> {
    const prompt = this.buildTitlePrompt(userMessage);
    const sessionKey = `${SYSTEM_SESSION_KEY_PREFIX}title-${sessionId}`;

    const response = await this.nonStreamingClient.request({
      messages: [{ role: 'user', content: prompt }],
      sessionKey,
    });

    return this.sanitizeTitle(response);
  }

  private async healthCheck(): Promise<boolean> {
    try {
      const sessionKey = `${SYSTEM_SESSION_KEY_PREFIX}health`;

      await this.nonStreamingClient.request({
        messages: [{ role: 'user', content: 'ping' }],
        sessionKey,
        timeout: 5000,
      });

      return true;
    } catch {
      return false;
    }
  }

  private async reformatNotification(rawResponse: string): Promise<string> {
    const prompt = this.buildReformatPrompt(rawResponse);
    const sessionKey = `${SYSTEM_SESSION_KEY_PREFIX}reformat-notif-${Date.now()}`;

    const response = await this.nonStreamingClient.request({
      messages: [{ role: 'user', content: prompt }],
      sessionKey,
      timeout: 60000,
    });

    return response;
  }

  private buildReformatPrompt(rawResponse: string): string {
    const truncated = rawResponse.slice(0, 4000);
    return `Reformat the raw notification output below into the canonical SmartNotification JSON shape used by this app.\n\nRaw output:\n${truncated}`;
  }

  private buildTitlePrompt(userMessage: string): string {
    const truncatedMessage = userMessage.slice(0, 200);
    return `Generate a short task title (max 6 words, no quotes) for this user request:\n\n"${truncatedMessage}"`;
  }

  private sanitizeTitle(title: string): string {
    let sanitized = title
      .trim()
      .replace(/^["']|["']$/g, '')
      .trim();

    if (sanitized.length > 80) {
      sanitized = sanitized.slice(0, 77) + '...';
    }

    return sanitized;
  }

  private async updateTimezone(timezone: string): Promise<boolean> {
    try {
      const sessionKey = `${SYSTEM_SESSION_KEY_PREFIX}update-timezone`;
      const message = `The user has updated their timezone to "${timezone}".`;

      console.log('[SystemSession] Updating timezone:', timezone);

      await this.nonStreamingClient.request({
        messages: [{ role: 'user', content: message }],
        sessionKey,
        timeout: 60000,
      });

      console.log('[SystemSession] Timezone updated');
      return true;
    } catch (err) {
      console.warn('[SystemSession] Failed to update timezone:', err);
      return false;
    }
  }

  private async updateLocation(location: string): Promise<boolean> {
    try {
      const sessionKey = `${SYSTEM_SESSION_KEY_PREFIX}update-location`;
      const message = `The user has updated their location to "${location}".`;

      console.log('[SystemSession] Updating location:', location);

      await this.nonStreamingClient.request({
        messages: [{ role: 'user', content: message }],
        sessionKey,
        timeout: 60000,
      });

      console.log('[SystemSession] Location updated');
      return true;
    } catch (err) {
      console.warn('[SystemSession] Failed to update location:', err);
      return false;
    }
  }

  private async syncUserPreferences(payload: ConnectionPreference): Promise<boolean> {
    try {
      const sessionKey = `${SYSTEM_SESSION_KEY_PREFIX}user-preferences-${Date.now()}`;
      const message = this.buildUserPreferencesPrompt(payload);

      console.log('[SystemSession] Syncing user preferences, trigger:', payload.trigger);

      await this.nonStreamingClient.request({
        messages: [{ role: 'user', content: message }],
        sessionKey,
        timeout: 60000,
      });

      console.log('[SystemSession] User preferences synced');

      return true;
    } catch (err) {
      console.warn('[SystemSession] Failed to sync user preferences:', err);
      return false;
    }
  }

  private buildUserPreferencesPrompt(payload: ConnectionPreference): string {
    return [
      'Update user preferences for a connected account.',
      '',
      `Trigger: ${payload.trigger}`,
      `Platform: ${payload.platform}`,
      `Account: ${payload.accountName}`,
      `Pay attention to: ${payload.attention || '(not specified)'}`,
      `Ignore: ${payload.ignore || '(not specified)'}`,
    ].join('\n');
  }

  private getDefaultResult(type: SystemOperationType): string | boolean {
    switch (type) {
      case 'generate_title':
        return '';
      case 'health_check':
        return false;
      case 'reformat_notification':
        return '';
      case 'update_timezone':
        return false;
      case 'update_location':
        return false;
      case 'user_preferences':
        return false;
      default:
        return '';
    }
  }
}
