import type { Store } from '../types/index';

const DB_NAME = 'octo-ai-assistant';
const DB_VERSION = 1;
export const TABLES = ['conversations', 'memories', 'tasks', 'notes', 'projects', 'settings', 'action_logs'] as const;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of TABLES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(storeName: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const req = fn(tx.objectStore(storeName));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error);
  }));
}

export function createIndexedDBStore(): Store {
  return {
    async getAll<T>(table: string): Promise<T[]> {
      return run<T[]>(table, 'readonly', (s) => s.getAll());
    },
    async put<T extends { id: string }>(table: string, item: T): Promise<void> {
      await run(table, 'readwrite', (s) => s.put(item));
    },
    async remove(table: string, id: string): Promise<void> {
      await run(table, 'readwrite', (s) => s.delete(id));
    },
    async clear(table: string): Promise<void> {
      await run(table, 'readwrite', (s) => s.clear());
    },
  };
}

export function createMemoryStore(): Store {
  const data = new Map<string, Map<string, unknown>>();
  const table = (name: string) => {
    if (!data.has(name)) data.set(name, new Map());
    return data.get(name) as Map<string, unknown>;
  };
  return {
    async getAll<T>(name: string): Promise<T[]> { return [...table(name).values()] as T[]; },
    async put<T extends { id: string }>(name: string, item: T): Promise<void> { table(name).set(item.id, item); },
    async remove(name: string, id: string): Promise<void> { table(name).delete(id); },
    async clear(name: string): Promise<void> { table(name).clear(); },
  };
}
