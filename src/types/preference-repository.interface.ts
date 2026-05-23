export type PreferenceType = 'string' | 'number' | 'boolean' | 'json';

export interface IPreferenceRepository {
  get<T = string>(namespace: string, key: string): Promise<T | null>;
  set(namespace: string, key: string, value: unknown, type?: PreferenceType): Promise<void>;
  getAll(namespace: string): Promise<Record<string, unknown>>;
  remove(namespace: string, key: string): Promise<void>;
}
