/**
 * Interface for system-level operations.
 * Provides a facade for internal application operations that route through
 * the non-streaming client without user-visible session management.
 */

/** Available system operation types */
export type SystemOperationType =
  | 'generate_title'
  | 'health_check'
  | 'reformat_notification'
  | 'update_timezone'
  | 'update_location'
  | 'user_preferences';

/** Operation payload for title generation */
export interface GenerateTitleOperation {
  type: 'generate_title';
  userMessage: string;
  sessionId: string;
}

/** Operation payload for health check */
export interface HealthCheckOperation {
  type: 'health_check';
}

/** Operation payload for reformatting a notification response into SmartNotification JSON */
export interface ReformatNotificationOperation {
  type: 'reformat_notification';
  rawResponse: string;
}

/** Operation payload for updating timezone */
export interface UpdateTimezoneOperation {
  type: 'update_timezone';
  timezone: string;
}

/** Operation payload for updating location */
export interface UpdateLocationOperation {
  type: 'update_location';
  location: string;
}

/** Connection preference — user specifies what to pay attention to or ignore for a connected account */
export interface ConnectionPreference {
  trigger: 'connection_preferences';
  platform: string;
  accountName: string;
  attention: string;
  ignore: string;
}

/** Operation payload for syncing user preferences */
export interface UserPreferencesOperation {
  type: 'user_preferences';
  payload: ConnectionPreference;
}

/** Union of all system operations */
export type SystemOperation =
  | GenerateTitleOperation
  | HealthCheckOperation
  | ReformatNotificationOperation
  | UpdateTimezoneOperation
  | UpdateLocationOperation
  | UserPreferencesOperation;

/** Result type mapping for each operation */
export type SystemOperationResult<T extends SystemOperationType> =
  T extends 'generate_title' ? string :
  T extends 'health_check' ? boolean :
  T extends 'reformat_notification' ? string :
  T extends 'update_timezone' ? boolean :
  T extends 'update_location' ? boolean :
  T extends 'user_preferences' ? boolean :
  never;

export interface ISystemSession {
  /**
   * Execute a system operation.
   * Routes to the appropriate client based on operation type.
   * @param operation - The operation to execute
   * @returns The operation result
   */
  execute<T extends SystemOperationType>(
    operation: SystemOperation & { type: T }
  ): Promise<SystemOperationResult<T>>;
}
