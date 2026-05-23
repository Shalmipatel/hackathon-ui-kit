export type ConnectionState =
  | 'UNAUTHENTICATED'
  | 'CONNECTING'
  | 'UNAUTHORIZED'
  | 'CONNECTED'
  | 'READY'
  | 'ERROR';

export interface ConnectionMeta {
  phase?: 'connecting' | 'provisioning' | 'verifying';
  provisioningStatus?: 'QUEUED' | 'SPAWNING';
  attempt?: number;
  maxAttempts?: number;
  errorMessage?: string;
  errorOrigin?: 'connecting' | 'provisioning';
}

export type ConnectionPortMessage =
  | { type: 'INIT_CONNECTION' }
  | { type: 'RESUME_CONNECTION' }
  | { type: 'RETRY_CONNECTION' }
  | { type: 'USER_PROCEED' }
  | { type: 'CONNECTION_UPDATE'; state: ConnectionState; meta?: ConnectionMeta };
