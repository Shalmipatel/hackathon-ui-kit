import type { RemoteSessionSummary, RemoteSessionHistory } from './remote-session';

export interface ISessionSyncClient {
  listSessions(limit?: number): Promise<RemoteSessionSummary[]>;
  getSessionHistory(sessionKey: string, limit?: number): Promise<RemoteSessionHistory>;
}
