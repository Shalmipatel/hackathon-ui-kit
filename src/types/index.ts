// Entities
export { type ExtensionSettings, DEFAULT_SETTINGS } from './settings';
export type {
  FileAttachment,
  ChatMessage,
  ConnectionStatus,
} from './chat-message';
export type { ChatSession, ChatSessionSummary, TaskStatus } from './chat-session';
export { GENERAL_SESSION_ID, GENERAL_START_CONTENT } from './chat-session';
export { type AuthState, type AuthStrategyConfig, DEFAULT_AUTH_STATE } from './auth';
export type { AuthCheckOptions } from './auth-repository.interface';
export type { ConnectionState, ConnectionMeta } from './connection';
export { type StreamState, INITIAL_STREAM_STATE } from './stream';
export type { CronNotification, SmartNotification, SmartClassification } from './notification';
export { parseSmartNotifications, extractJsonBlock, looksLikeSmartNotification, parseSkillFrontmatter } from './notification';
export type { RemoteSessionSummary, RemoteMessage, RemoteSessionHistory } from './remote-session';
export type { SocialAccount, SocialPlatform } from './social';
export type { ConnectedAccount, IntegrationService, GoogleAccessToken } from './integration';

// Constants
export {
  ALLOWED_IMAGE_MIMES,
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
  FILE_INPUT_ACCEPT,
  THUMBNAIL_MAX_PX,
  THUMBNAIL_QUALITY,
  SYSTEM_SESSION_KEY_PREFIX,
  NON_STREAMING_TIMEOUT_MS,
} from './constants';

// Interfaces
export type { IStorageProvider } from './storage.interface';
export type { ISettingsRepository } from './settings-repository.interface';
export type { IChatRepository } from './chat-repository.interface';
export type { IAuthRepository } from './auth-repository.interface';
export type { IStreamClient, StreamEvent, StreamRequest } from './stream-client.interface';
export type { INonStreamingClient, NonStreamingRequest } from './non-streaming-client.interface';
export type {
  ISystemSession,
  SystemOperationType,
  SystemOperation,
  SystemOperationResult,
  GenerateTitleOperation,
  ReformatNotificationOperation,
  UpdateTimezoneOperation,
  UpdateLocationOperation,
  UserPreferencesOperation,
  ConnectionPreference,
} from './system-session.interface';
export type { ITranscriptionClient } from './transcription-client.interface';
export { TranscriptionError, TranscriptionErrorCode } from './transcription-client.interface';
export type { ISessionSyncClient } from './session-sync-client.interface';
export type { ISocialClient } from './social-client.interface';
export type {
  IIntegrationClient,
  IntegrationCredentialStatus,
} from './integration-client.interface';
export type {
  IContextDataClient,
  DataQueryBody,
  DataExecuteBody,
  DataQueryResult,
  DataExecuteResult,
} from './context-data-client.interface';
export type {
  IBrowserConnectionRepository,
  BrowserConnection,
} from './browser-connection-repository.interface';
export type {
  IPreferenceRepository,
  PreferenceType,
} from './preference-repository.interface';
