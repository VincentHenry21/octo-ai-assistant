import type { NoteItem, ProjectItem, Store, TaskItem } from '../types/index';

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
const now = () => Date.now();

export const taskRepo = (store: Store) => ({
  async list(): Promise<TaskItem[]> {
    const items = await store.getAll<TaskItem>('tasks');
    return items.sort((a, b) => b.createdAt - a.createdAt);
  },
  async create(title: string, notes = ''): Promise<TaskItem> {
    const item: TaskItem = { id: uid(), title, notes, done: false, createdAt: now(), updatedAt: now() };
    await store.put('tasks', item);
    return item;
  },
  async update(id: string, patch: Partial<TaskItem>): Promise<TaskItem | null> {
    const items = await store.getAll<TaskItem>('tasks');
    const found = items.find((t) => t.id === id);
    if (!found) return null;
    const next = { ...found, ...patch, id, updatedAt: now() };
    await store.put('tasks', next);
    return next;
  },
  async remove(id: string): Promise<boolean> {
    const items = await store.getAll<TaskItem>('tasks');
    if (!items.some((t) => t.id === id)) return false;
    await store.remove('tasks', id);
    return true;
  },
  async search(query: string): Promise<TaskItem[]> {
    const q = query.toLowerCase();
    return (await this.list()).filter((t) => (t.title + ' ' + (t.notes || '')).toLowerCase().includes(q));
  },
});

export const noteRepo = (store: Store) => ({
  async list(): Promise<NoteItem[]> {
    const items = await store.getAll<NoteItem>('notes');
    return items.sort((a, b) => b.updatedAt - a.updatedAt);
  },
  async create(title: string, body: string): Promise<NoteItem> {
    const item: NoteItem = { id: uid(), title, body, createdAt: now(), updatedAt: now() };
    await store.put('notes', item);
    return item;
  },
  async update(id: string, patch: Partial<NoteItem>): Promise<NoteItem | null> {
    const items = await store.getAll<NoteItem>('notes');
    const found = items.find((n) => n.id === id);
    if (!found) return null;
    const next = { ...found, ...patch, id, updatedAt: now() };
    await store.put('notes', next);
    return next;
  },
  async remove(id: string): Promise<boolean> {
    const items = await store.getAll<NoteItem>('notes');
    if (!items.some((n) => n.id === id)) return false;
    await store.remove('notes', id);
    return true;
  },
  async search(query: string): Promise<NoteItem[]> {
    const q = query.toLowerCase();
    return (await this.list()).filter((n) => (n.title + ' ' + n.body).toLowerCase().includes(q));
  },
});

export const projectRepo = (store: Store) => ({
  async list(): Promise<ProjectItem[]> {
    const items = await store.getAll<ProjectItem>('projects');
    return items.sort((a, b) => b.createdAt - a.createdAt);
  },
  async create(name: string, description = ''): Promise<ProjectItem> {
    const item: ProjectItem = { id: uid(), name, description, createdAt: now(), updatedAt: now() };
    await store.put('projects', item);
    return item;
  },
  async remove(id: string): Promise<boolean> {
    const items = await store.getAll<ProjectItem>('projects');
    if (!items.some((p) => p.id === id)) return false;
    await store.remove('projects', id);
    return true;
  },
});
