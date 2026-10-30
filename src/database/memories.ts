import type { MemoryCategory, MemoryItem, Store } from '../types/index';
import { uid } from './tasks';

export const memoryRepo = (store: Store) => ({
  async list(): Promise<MemoryItem[]> {
    const items = await store.getAll<MemoryItem>('memories');
    return items.sort((a, b) => b.createdAt - a.createdAt);
  },
  async create(category: MemoryCategory, content: string, encrypted = false): Promise<MemoryItem> {
    const item: MemoryItem = { id: uid(), category, content, encrypted, createdAt: Date.now(), updatedAt: Date.now() };
    await store.put('memories', item);
    return item;
  },
  async update(id: string, patch: Partial<MemoryItem>): Promise<MemoryItem | null> {
    const items = await store.getAll<MemoryItem>('memories');
    const found = items.find((m) => m.id === id);
    if (!found) return null;
    const next = { ...found, ...patch, id, updatedAt: Date.now() };
    await store.put('memories', next);
    return next;
  },
  async remove(id: string): Promise<boolean> {
    const items = await store.getAll<MemoryItem>('memories');
    if (!items.some((m) => m.id === id)) return false;
    await store.remove('memories', id);
    return true;
  },
  async clear(): Promise<void> { await store.clear('memories'); },
  async search(query: string): Promise<MemoryItem[]> {
    const q = query.toLowerCase();
    return (await this.list()).filter((m) => (m.category + ' ' + m.content).toLowerCase().includes(q));
  },
});
