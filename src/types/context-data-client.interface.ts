export interface DataQueryBody {
  table: string;
  columns?: string[];
  where?: Record<string, unknown>;
  orderBy?: { column: string; direction: 'ASC' | 'DESC' };
  limit?: number;
}

export interface DataExecuteBody {
  action: 'insert' | 'update' | 'delete';
  table: string;
  data?: Record<string, unknown>;
  where?: Record<string, unknown>;
}

export interface DataQueryResult<T = Record<string, unknown>> {
  rows: T[];
  count: number;
}

export interface DataExecuteResult {
  changes: number;
  lastInsertRowid?: number;
}

export interface IContextDataClient {
  query<T = Record<string, unknown>>(body: DataQueryBody): Promise<DataQueryResult<T>>;
  execute(body: DataExecuteBody): Promise<DataExecuteResult>;
}
