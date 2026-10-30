import type { ChatMessage, Conversation, Store } from '../types/index';
import { uid } from './tasks';

export const conversationRepo = (store: Store) => ({
  async list(): Promise<Conversation[]> {
    const items = await store.getAll<Conversation>('conversations');
    return items.sort((a, b) => b.updatedAt - a.updatedAt);
  },
  async create(title = 'New conversation'): Promise<Conversation> {
    const item: Conversation = { id: uid(), title, messages: [], createdAt: Date.now(), updatedAt: Date.now() };
    await store.put('conversations', item);
    return item;
  },
  async get(id: string): Promise<Conversation | null> {
    const items = await store.getAll<Conversation>('conversations');
    return items.find((c) => c.id === id) || null;
  },
  async addMessage(id: string, message: ChatMessage): Promise<Conversation | null> {
    const convo = await this.get(id);
    if (!convo) return null;
    const next: Conversation = {
      ...convo,
      messages: [...convo.messages, message],
      updatedAt: Date.now(),
      title: convo.messages.length === 0 && message.role === 'user'
        ? message.text.slice(0, 60) : convo.title,
    };
    await store.put('conversations', next);
    return next;
  },
  async updateMessages(id: string, messages: ChatMessage[]): Promise<Conversation | null> {
    const convo = await this.get(id);
    if (!convo) return null;
    const next: Conversation = { ...convo, messages, updatedAt: Date.now() };
    await store.put('conversations', next);
    return next;
  },
  async remove(id: string): Promise<void> { await store.remove('conversations', id); },
});
export function newMessage(role: 'user' | 'assistant', text: string): ChatMessage {
  return { id: uid(), role, text, createdAt: Date.now() };
}
