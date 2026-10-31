export type OctoState = 'IDLE' | 'LISTENING' | 'THINKING' | 'RESPONDING' | 'EXECUTING' | 'ERROR';
export type Section = 'home' | 'chat' | 'workspace' | 'memory' | 'settings';
export type MemoryCategory = 'personal preferences' | 'user-provided facts' | 'projects' | 'professional context' | 'goals' | 'important instructions';

export interface TaskItem { id: string; title: string; notes?: string; done: boolean; createdAt: number; updatedAt: number; }
export interface NoteItem { id: string; title: string; body: string; createdAt: number; updatedAt: number; }
export interface ProjectItem { id: string; name: string; description?: string; createdAt: number; updatedAt: number; }
export interface MemoryItem { id: string; category: MemoryCategory; content: string; encrypted: boolean; createdAt: number; updatedAt: number; }
export interface ChatMessage { id: string; role: 'user' | 'assistant'; text: string; createdAt: number; }
export interface Conversation { id: string; title: string; messages: ChatMessage[]; createdAt: number; updatedAt: number; }
export interface ActionLog { id: string; tool: string; args: Record<string, unknown>; result: string; createdAt: number; }

export interface Store {
  getAll<T>(table: string): Promise<T[]>;
  put<T extends { id: string }>(table: string, item: T): Promise<void>;
  remove(table: string, id: string): Promise<void>;
  clear(table: string): Promise<void>;
}

export interface ToolResult { ok: boolean; tool: string; result?: unknown; error?: string; code?: string; }
export interface OctoSettings {
  model: string;
  voiceEnabled: boolean;
  voiceRate: number;
  encryptionEnabled: boolean;
  appearance: 'dark';
}
export const DEFAULT_SETTINGS: OctoSettings = {
  model: 'gemini-3.8-flash', voiceEnabled: true, voiceRate: 1, encryptionEnabled: false, appearance: 'dark',
};
export const MODEL_ALLOWLIST = ['gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-3-flash', 'gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-3.1-pro-preview'] as const;
export const MEMORY_CATEGORIES: MemoryCategory[] = [
  'personal preferences', 'user-provided facts', 'projects', 'professional context', 'goals', 'important instructions',
];
