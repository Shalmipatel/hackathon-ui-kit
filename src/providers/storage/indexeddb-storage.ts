import type { IStorageProvider } from '@/types';
import { StorageQuotaError } from './storage-errors';

const DEFAULT_DB_NAME = 'neoclaw';
const DB_VERSION = 1;
const STORE_NAME = 'kv';

/**
 * Web-native storage provider backed by IndexedDB.
 * Suited for large, frequently-written data: chat sessions, messages.
 *
 * Uses a single "kv" object store with out-of-line string keys.
 * The database connection is lazily initialized on first operation
 * and cached for subsequent calls. Handles connection loss
 * (InvalidStateError) by resetting the cached reference and retrying once.
 */
export class IndexedDBStorageProvider implements IStorageProvider {
  private db: IDBDatabase | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;
  private readonly dbName: string;

  constructor(dbName: string = DEFAULT_DB_NAME) {
    this.dbName = dbName;
  }

  private openDB(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db);
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.dbPromise = null;

        this.db.onversionchange = () => {
          this.db?.close();
          this.db = null;
        };

        resolve(this.db);
      };

      request.onerror = () => {
        this.dbPromise = null;
        reject(new Error(`Failed to open IndexedDB "${this.dbName}": ${request.error?.message}`));
      };

      request.onblocked = () => {
        console.warn(`[IndexedDBStorageProvider] Database "${this.dbName}" open blocked by another tab`);
      };
    });

    return this.dbPromise;
  }

  private resetConnection(): void {
    try { this.db?.close(); } catch { /* already closed */ }
    this.db = null;
    this.dbPromise = null;
  }

  private async withRetry<T>(operation: (db: IDBDatabase) => Promise<T>): Promise<T> {
    try {
      const db = await this.openDB();
      return await operation(db);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'InvalidStateError') {
        this.resetConnection();
        const db = await this.openDB();
        return await operation(db);
      }
      throw err;
    }
  }

  private transact<T>(
    db: IDBDatabase,
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const request = action(store);

      request.onsuccess = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
    });
  }

  async get<T>(key: string, defaultValue: T): Promise<T> {
    try {
      const result = await this.withRetry((db) =>
        this.transact<T | undefined>(db, 'readonly', (store) => store.get(key)),
      );
      return result !== undefined ? result : defaultValue;
    } catch (err) {
      console.warn(`[IndexedDBStorageProvider] Failed to read key "${key}", returning default`, err);
      return defaultValue;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      await this.withRetry((db) =>
        this.transact(db, 'readwrite', (store) => store.put(value, key)),
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'QuotaExceededError') {
        throw new StorageQuotaError(key, err);
      }
      throw err;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await this.withRetry((db) =>
        this.transact(db, 'readwrite', (store) => store.delete(key)),
      );
    } catch (err) {
      console.warn(`[IndexedDBStorageProvider] Failed to remove key "${key}"`, err);
    }
  }

  async clear(): Promise<void> {
    try {
      await this.withRetry((db) =>
        this.transact(db, 'readwrite', (store) => store.clear()),
      );
    } catch (err) {
      console.warn('[IndexedDBStorageProvider] Failed to clear store', err);
    }
  }
}
