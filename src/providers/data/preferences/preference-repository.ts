import type { IContextDataClient } from '@/types/context-data-client.interface';
import type {
  IPreferenceRepository,
  PreferenceType,
} from '@/types/preference-repository.interface';

const TABLE = 'preferences';

interface PreferenceRow {
  namespace: string;
  key: string;
  value: string;
  type: PreferenceType;
  updated_at: number;
}

function serialize(value: unknown, type: PreferenceType): string {
  switch (type) {
    case 'json':
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      return String(value);
    case 'string':
    default:
      return String(value ?? '');
  }
}

function deserialize(raw: string, type: PreferenceType): unknown {
  switch (type) {
    case 'json':
      try { return JSON.parse(raw); } catch { return null; }
    case 'boolean':
      return raw === 'true' || raw === '1';
    case 'number': {
      const n = Number(raw);
      return Number.isNaN(n) ? null : n;
    }
    case 'string':
    default:
      return raw;
  }
}

function inferType(value: unknown): PreferenceType {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'object' && value !== null) return 'json';
  return 'string';
}

export class PreferenceRepository implements IPreferenceRepository {
  constructor(private client: IContextDataClient) {}

  async get<T = string>(namespace: string, key: string): Promise<T | null> {
    const result = await this.client.query<PreferenceRow>({
      table: TABLE,
      where: { namespace, key },
      limit: 1,
    });

    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return deserialize(row.value, row.type) as T;
  }

  async set(namespace: string, key: string, value: unknown, type?: PreferenceType): Promise<void> {
    const resolvedType = type ?? inferType(value);
    const serialized = serialize(value, resolvedType);
    const now = Date.now();

    const existing = await this.client.query<PreferenceRow>({
      table: TABLE,
      where: { namespace, key },
      limit: 1,
    });

    if (existing.rows.length > 0) {
      await this.client.execute({
        action: 'update',
        table: TABLE,
        data: { value: serialized, type: resolvedType, updated_at: now },
        where: { namespace, key },
      });
    } else {
      await this.client.execute({
        action: 'insert',
        table: TABLE,
        data: { namespace, key, value: serialized, type: resolvedType, updated_at: now },
      });
    }
  }

  async getAll(namespace: string): Promise<Record<string, unknown>> {
    const result = await this.client.query<PreferenceRow>({
      table: TABLE,
      where: { namespace },
    });

    const map: Record<string, unknown> = {};
    for (const row of result.rows) {
      map[row.key] = deserialize(row.value, row.type);
    }
    return map;
  }

  async remove(namespace: string, key: string): Promise<void> {
    await this.client.execute({
      action: 'delete',
      table: TABLE,
      where: { namespace, key },
    });
  }
}
