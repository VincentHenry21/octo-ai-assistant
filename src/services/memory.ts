import type { MemoryCategory, MemoryItem, Store } from '../types/index';
import { memoryRepo } from '../database/memories';
import { decryptText, encryptText } from './encryption';

export interface CryptoSession { enabled: boolean; passphrase: string; }

export function createMemoryService(store: Store, cryptoSession: CryptoSession) {
  const repo = memoryRepo(store);
  async function decode(item: MemoryItem): Promise<MemoryItem> {
    if (!item.encrypted) return item;
    if (!cryptoSession.enabled || !cryptoSession.passphrase) return { ...item, content: 'Encrypted memory. Enter your passphrase in Settings to view it.' };
    try {
      const content = await decryptText(item.content, cryptoSession.passphrase);
      return { ...item, content };
    } catch {
      return { ...item, content: 'Encrypted memory. The passphrase did not match.' };
    }
  }
  return {
    async list(): Promise<MemoryItem[]> {
      const items = await repo.list();
      return Promise.all(items.map(decode));
    },
    async search(query: string): Promise<MemoryItem[]> {
      const items = await repo.search(query);
      const decoded = await Promise.all(items.map(decode));
      return decoded.filter((m) => m.content.toLowerCase().includes(query.toLowerCase()) || m.category.toLowerCase().includes(query.toLowerCase()));
    },
    async save(category: MemoryCategory, content: string, confirmed: boolean): Promise<MemoryItem> {
      const text = content.trim();
      if (!text) throw new Error('Memory content is empty.');
      if (!confirmed) throw new Error('CONFIRMATION_REQUIRED');
      let stored = text;
      let encrypted = false;
      if (cryptoSession.enabled && cryptoSession.passphrase) {
        stored = await encryptText(text, cryptoSession.passphrase);
        encrypted = true;
      }
      return repo.create(category, stored, encrypted);
    },
    async update(id: string, content: string): Promise<MemoryItem | null> {
      let stored = content;
      let encrypted = false;
      if (cryptoSession.enabled && cryptoSession.passphrase) {
        stored = await encryptText(content, cryptoSession.passphrase);
        encrypted = true;
      }
      return repo.update(id, { content: stored, encrypted });
    },
    async remove(id: string, confirmed: boolean): Promise<boolean> {
      if (!confirmed) throw new Error('CONFIRMATION_REQUIRED');
      return repo.remove(id);
    },
    async clear(confirmed: boolean): Promise<void> {
      if (!confirmed) throw new Error('CONFIRMATION_REQUIRED');
      await repo.clear();
    },
  };
}
