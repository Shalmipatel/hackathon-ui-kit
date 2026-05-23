export class StorageQuotaError extends Error {
  constructor(key: string, cause?: unknown) {
    super(`Storage quota exceeded while writing key "${key}"`);
    this.name = 'StorageQuotaError';
    this.cause = cause;
  }
}
