import { MODEL_ALLOWLIST } from '../types/index';
import { SYSTEM_IDENTITY } from '../config/index';

// Bring Your Own Key, browser edition.
// The key lives ONLY in this module variable, in application memory.
// It is never written to LocalStorage or IndexedDB, never committed, never logged,
// and it is cleared when the user disconnects or the session ends.
// Warning, also shown in Settings: a browser key can be inspected in the browser,
// so it is not equivalent to a server-side secret. Use API restrictions and usage
// limits in Google AI Studio. Gemini receives the prompt and, at most, a few
// relevant memory snippets chosen by the app, never the entire database.
let activeKey = '';
export function setGeminiKey(key: string): void { activeKey = key.trim(); }
export function clearGeminiKey(): void { activeKey = ''; }
export function hasGeminiKey(): boolean { return activeKey.length > 0; }

export type IntelligenceMode = 'GENERAL' | 'BUSINESS' | 'ACADEMIC' | 'AGENT';
export const MODES: IntelligenceMode[] = ['GENERAL', 'BUSINESS', 'ACADEMIC', 'AGENT'];

export function autoMode(text: string): IntelligenceMode {
  const t = text.toLowerCase();
  if (/(create|add|plan my day|make a|organise|organize).*(task|note|project|plan)/.test(t)) return 'AGENT';
  if (/(assignment|essay|research|citation|thesis|exam|study)/.test(t)) return 'ACADEMIC';
  if (/(business|pricing|marketing|revenue|sales|brand|startup)/.test(t)) return 'BUSINESS';
  return 'GENERAL';
}
export function modeInstruction(mode: IntelligenceMode): string {
  switch (mode) {
    case 'BUSINESS': return 'Focus on practical business reasoning: market, offer, pricing, risks, and next actions, with numbers stated as assumptions when they are not given.';
    case 'ACADEMIC': return 'Focus on clear academic reasoning, definitions, structure, and real, well known sources only. Never invent a source, author, or year.';
    case 'AGENT': return 'Focus on concrete actions the user asked for. State what action you are suggesting, and never claim an action was completed unless the app confirms it.';
    default: return 'Answer generally and helpfully.';
  }
}

export interface ChatTurn { role: 'user' | 'model'; text: string; }
export type ChatErrorCode = 'MISSING_KEY' | 'INVALID_KEY' | 'RATE_LIMITED' | 'NETWORK' | 'TIMEOUT' | 'SERVER';
export class ChatError extends Error { code: ChatErrorCode; constructor(code: ChatErrorCode, message: string) { super(message); this.code = code; } }

export function recoveryFor(code: ChatErrorCode): string {
  switch (code) {
    case 'MISSING_KEY': return 'Enter your own Gemini key in Settings, then try again. The key is kept in memory only and is cleared on disconnect.';
    case 'INVALID_KEY': return 'Google rejected this key with: API key not valid. Please pass a valid API key. Copy a fresh key from Google AI Studio, paste it in Settings, and retry. Do not reuse a deleted or mistyped key.';
    case 'RATE_LIMITED': return 'Google rate limited the request. Wait a minute, then retry.';
    case 'TIMEOUT': return 'The request timed out. Retry with a shorter message.';
    case 'NETWORK': return 'You appear to be offline. Check your connection, then retry. Offline AI responses are not available.';
    default: return 'Gemini returned an error. Check Settings diagnostics, then retry.';
  }
}

function geminiErrorMessage(status: number, data: unknown): { code: ChatErrorCode; message: string } {
  const msg = (data && typeof data === 'object' && 'error' in data && data.error && typeof data.error === 'object' && 'message' in data.error && typeof data.error.message === 'string')
    ? data.error.message : `Gemini returned HTTP ${status}.`;
  if (status === 400 && /api key not valid/i.test(msg)) return { code: 'INVALID_KEY', message: 'API key not valid. Please pass a valid API key.' };
  if (status === 401 || status === 403) return { code: 'INVALID_KEY', message: msg };
  if (status === 429) return { code: 'RATE_LIMITED', message: msg };
  return { code: 'SERVER', message: msg };
}

async function callGemini(model: string, turns: ChatTurn[], systemText: string, stream: boolean, onText?: (delta: string) => void, signal?: AbortSignal): Promise<string> {
  if (!hasGeminiKey()) throw new ChatError('MISSING_KEY', 'No Gemini key is active. Enter your key in Settings first.');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
  const body = {
    system_instruction: { parts: [{ text: systemText }] },
    contents: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
  };
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': activeKey },
      body: JSON.stringify(body), signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw new ChatError('TIMEOUT', 'The request was stopped.');
    throw new ChatError('NETWORK', 'Could not reach Gemini. Check your connection.');
  }
  if (!res.ok) {
    let data: unknown = null;
    try { data = await res.json(); } catch { /* keep generic */ }
    const mapped = geminiErrorMessage(res.status, data);
    throw new ChatError(mapped.code, mapped.message);
  }
  if (!stream) {
    const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    return text || '';
  }
  if (!res.body) throw new ChatError('SERVER', 'Gemini returned an empty stream.');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      try {
        const parsed = JSON.parse(payload) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string } };
        if (parsed.error?.message) throw new ChatError('SERVER', parsed.error.message);
        const delta = (parsed.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
        if (delta) { full += delta; onText?.(delta); }
      } catch (err) { if (err instanceof ChatError) throw err; }
    }
  }
  return full;
}

export async function validateConnection(model: string): Promise<{ ok: boolean; message: string }> {
  try {
    const text = await callGemini(model, [{ role: 'user', text: 'Reply with the single word ok.' }], SYSTEM_IDENTITY, false);
    return { ok: true, message: text.trim() ? 'Connection works. Gemini replied.' : 'Connection works, but Gemini returned an empty reply.' };
  } catch (err) {
    if (err instanceof ChatError) return { ok: false, message: `${err.message} ${recoveryFor(err.code)}` };
    return { ok: false, message: 'Connection check failed.' };
  }
}

export interface WorkerHealth { ok: boolean; geminiConfigured: boolean; appTokenRequired: boolean; liveMode: string; error?: string; }
export function normalizeWorkerUrl(raw: string): string {
  return raw.trim().replace(/\/$/, '');
}
export async function checkWorkerHealth(workerUrl: string): Promise<WorkerHealth> {
  const base = normalizeWorkerUrl(workerUrl);
  if (!base) return { ok: false, geminiConfigured: false, appTokenRequired: false, liveMode: '', error: 'Enter a Worker URL first.' };
  try {
    const res = await fetch(`${base}/health`);
    if (!res.ok) return { ok: false, geminiConfigured: false, appTokenRequired: false, liveMode: '', error: `Worker health returned HTTP ${res.status}. Check the URL and CORS origin.` };
    const data = await res.json() as { ok?: boolean; geminiConfigured?: boolean; appTokenRequired?: boolean; liveMode?: string };
    return { ok: Boolean(data.ok), geminiConfigured: Boolean(data.geminiConfigured), appTokenRequired: Boolean(data.appTokenRequired), liveMode: String(data.liveMode || '') };
  } catch {
    return { ok: false, geminiConfigured: false, appTokenRequired: false, liveMode: '', error: 'Could not reach the Worker. Check the URL, your connection, and CORS.' };
  }
}
export async function streamChatViaWorker(
  workerUrl: string, appToken: string, turns: ChatTurn[], model: string, mode: IntelligenceMode, memorySnippets: string[],
  onText: (delta: string) => void, signal?: AbortSignal,
): Promise<void> {
  const base = normalizeWorkerUrl(workerUrl);
  const systemText = memorySnippets.length > 0
    ? `${SYSTEM_IDENTITY}\n\n${modeInstruction(mode)}\n\nRelevant saved memory (only these snippets, never the whole database):\n${memorySnippets.map((s) => '- ' + s).join('\n')}`
    : `${SYSTEM_IDENTITY}\n\n${modeInstruction(mode)}`;
  let res: Response;
  try {
    res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(appToken ? { 'X-Octo-App-Token': appToken } : {}) },
      body: JSON.stringify({ messages: turns, model, systemText }),
      signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw new ChatError('TIMEOUT', 'The request was stopped.');
    throw new ChatError('NETWORK', 'Could not reach the Worker backend.');
  }
  if (!res.ok) {
    let code: ChatErrorCode = 'SERVER';
    let message = `Worker returned HTTP ${res.status}.`;
    try {
      const data = await res.json() as { code?: string; error?: string };
      if (data.code === 'MISSING_SECRET') code = 'SERVER';
      else if (data.code === 'INVALID_KEY') code = 'INVALID_KEY';
      else if (data.code === 'RATE_LIMITED') code = 'RATE_LIMITED';
      if (data.error) message = data.error;
    } catch { /* keep generic */ }
    throw new ChatError(code, message);
  }
  if (!res.body) throw new ChatError('SERVER', 'The Worker returned an empty stream.');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      try {
        const parsed = JSON.parse(payload) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string } };
        if (parsed.error?.message) throw new ChatError('SERVER', parsed.error.message);
        const delta = (parsed.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
        if (delta) onText(delta);
      } catch (err) { if (err instanceof ChatError) throw err; }
    }
  }
}

export async function streamChat(
  turns: ChatTurn[], model: string, mode: IntelligenceMode, memorySnippets: string[],
  onText: (delta: string) => void, signal?: AbortSignal,
): Promise<void> {
  if (!MODEL_ALLOWLIST.includes(model as (typeof MODEL_ALLOWLIST)[number])) {
    throw new ChatError('SERVER', 'That model is not in the allowed list. Choose a model in Settings.');
  }
  const systemText = memorySnippets.length > 0
    ? `${SYSTEM_IDENTITY}\n\n${modeInstruction(mode)}\n\nRelevant saved memory (only these snippets, never the whole database):\n${memorySnippets.map((s) => '- ' + s).join('\n')}`
    : `${SYSTEM_IDENTITY}\n\n${modeInstruction(mode)}`;
  await callGemini(model, turns, systemText, true, onText, signal);
}
