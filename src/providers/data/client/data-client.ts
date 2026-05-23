import type {
  IContextDataClient,
  DataQueryBody,
  DataExecuteBody,
  DataQueryResult,
  DataExecuteResult,
} from '@/types';
import type { GatewayTransport } from '@/providers/transport/gateway-transport';
import { DATA_ENDPOINTS } from './data-endpoints';

interface DataApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export class DataClient implements IContextDataClient {
  constructor(private gateway: GatewayTransport) {}

  async query<T = Record<string, unknown>>(body: DataQueryBody): Promise<DataQueryResult<T>> {
    const resp = await this.gateway.request(DATA_ENDPOINTS.QUERY, {
      method: 'POST',
      body,
    });

    const json = (await resp.json()) as DataApiResponse<DataQueryResult<T>>;
    if (!json.success || !json.data) {
      throw new Error(json.error ?? 'Data API query failed');
    }
    return json.data;
  }

  async execute(body: DataExecuteBody): Promise<DataExecuteResult> {
    const resp = await this.gateway.request(DATA_ENDPOINTS.EXECUTE, {
      method: 'POST',
      body,
    });

    const json = (await resp.json()) as DataApiResponse<DataExecuteResult>;
    if (!json.success || !json.data) {
      throw new Error(json.error ?? 'Data API execute failed');
    }
    return json.data;
  }
}
