import { LIVE_MODEL, SYSTEM_IDENTITY } from './types';
import type { ChatTurn } from './types';

export interface GeminiError { code: string; message: string; status: number; }

function mapGeminiError(status: number, data: unknown): GeminiError {
  const raw = (data && typeof data === 'object' && 'error' in data && data.error && typeof data.error === 'object' && 'message' in data.error && typeof data.error.message === 'string')
    ? data.error.message : `Gemini returned HTTP ${status}.`;
  const message = raw.slice(0, 300);
  if (status === 400 && /api key not valid/i.test(message)) return { code: 'INVALID_KEY', message: 'API key not valid. Please pass a valid API key.', status };
  if (status === 401 || status === 403) return { code: 'INVALID_KEY', message, status };
  if (status === 429) return { code: 'RATE_LIMITED', message, status };
  if (status >= 500) return { code: 'GEMINI_UNAVAILABLE', message: 'Gemini is unavailable right now. Try again in a few minutes.', status };
  return { code: 'GEMINI_ERROR', message, status };
}

async function geminiPost(apiKey: string, path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<{ ok: boolean; status: number; data: unknown; raw: Response | null }> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body), signal,
  });
  let data: unknown = null;
  try { data = await res.clone().json(); } catch { /* non-JSON body */ }
  return { ok: res.ok, status: res.status, data, raw: res };
}

export async function streamGeminiChat(apiKey: string, model: string, turns: ChatTurn[], systemText: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemText || SYSTEM_IDENTITY }] },
        contents: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
        generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      let data: unknown = null;
      try { data = await res.json(); } catch { /* keep generic */ }
      const mapped = mapGeminiError(res.status, data);
      return new Response(JSON.stringify({ error: mapped.message, code: mapped.code }), { status: mapped.status, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(res.body, { status: 200, headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
  } catch (err) {
    const message = err instanceof Error && err.name === 'AbortError' ? 'Gemini request timed out.' : 'Could not reach Gemini. Check your connection and try again.';
    return new Response(JSON.stringify({ error: message, code: 'NETWORK' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  } finally {
    clearTimeout(timeout);
  }
}

export async function analyzeImage(apiKey: string, imageBase64: string, mimeType: string): Promise<{ ok: boolean; text?: string; error?: GeminiError }> {
  const prompt = 'Describe this image in plain language. List the main objects you can see, read any visible text (OCR), and explain the scene. Do not invent objects or text that are not visible. If text is unclear, say so.';
  const result = await geminiPost(apiKey, 'models/gemini-2.5-flash:generateContent', {
    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: imageBase64 } }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
  });
  if (!result.ok) return { ok: false, error: mapGeminiError(result.status, result.data) };
  const data = result.data as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  return { ok: true, text: text || 'Gemini returned no description for this image.' };
}

// Ephemeral Live token, per the official Gemini Live API documentation:
// AuthTokenService.CreateToken, v1alpha, defaults expire in 30 minutes and new
// sessions must start within 60 seconds, uses is 1, locked to a Live model and
// TEXT response modality. If this endpoint is unavailable for the key or model,
// the caller must fall back to still-image analysis, labeled as such.
export async function createLiveToken(apiKey: string): Promise<{ ok: boolean; token?: string; expiresAt?: string; wsUrl?: string; model?: string; error?: string }> {
  const now = Date.now();
  const expireTime = new Date(now + 30 * 60 * 1000).toISOString();
  const newSessionExpireTime = new Date(now + 60 * 1000).toISOString();
  const res = await fetch('https://generativelanguage.googleapis.com/v1alpha/authTokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      config: {
        uses: 1,
        expire_time: expireTime,
        new_session_expire_time: newSessionExpireTime,
        live_connect_constraints: { model: LIVE_MODEL, config: { response_modalities: ['TEXT'] } },
      },
    }),
  });
  let data: unknown = null;
  try { data = await res.json(); } catch { /* keep generic */ }
  if (!res.ok) return { ok: false, error: 'Live token endpoint unavailable from Gemini for this key or model.' };
  const name = (data as { name?: string }).name;
  if (!name) return { ok: false, error: 'Live token endpoint returned no token.' };
  return { ok: true, token: name, expiresAt: expireTime, wsUrl: 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent', model: LIVE_MODEL };
}
