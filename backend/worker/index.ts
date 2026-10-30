import type { Env, ExecutionContextLike, UsageCounts } from './types';
import { MODEL_ALLOWLIST, SYSTEM_IDENTITY } from './types';
import { checkAppToken, corsHeaders, handlePreflight, isAllowedOrigin, jsonError, jsonOk } from './auth';
import { allow, clientKey, LIMITS } from './rateLimit';
import { analyzeImage, createLiveToken, streamGeminiChat } from './gemini';

const usage: UsageCounts = {
  requests: 0, chatRequests: 0, liveTokens: 0, visionRequests: 0, errors: 0,
  startedAt: new Date().toISOString(),
};
function countError() { usage.errors += 1; }

function recoveryFor(code: string): string {
  switch (code) {
    case 'MISSING_SECRET': return 'Add GEMINI_API_KEY as an encrypted Worker secret in Cloudflare Dashboard, Worker Settings, Variables, then redeploy.';
    case 'INVALID_KEY': return 'Google rejected the Worker secret key. Copy a fresh key from Google AI Studio into the Worker secret and redeploy.';
    case 'RATE_LIMITED': return 'Too many requests. Wait until the retry time shown, then try again.';
    case 'LIVE_UNAVAILABLE': return 'Live token minting is unavailable. Use still-image analysis in Live Vision instead.';
    default: return 'Try again. If the problem continues, check Worker health in OCTO Settings.';
  }
}

function parseJson(body: string): unknown {
  try { return JSON.parse(body); } catch { return null; }
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContextLike): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';
    usage.requests += 1;

    const preflight = handlePreflight(request, env);
    if (preflight) return preflight;
    if (!isAllowedOrigin(request, env)) {
      countError();
      return jsonError('Origin is not allowed.', 'FORBIDDEN', 403, request, env, 'Open OCTO from its GitHub Pages origin, or add your origin to ALLOWED_ORIGIN in the Worker.');
    }
    const withCors = (res: Response): Response => {
      const headers = new Headers(res.headers);
      const cors = corsHeaders(request, env);
      for (const [k, v] of Object.entries(cors)) if (v) headers.set(k, v);
      return new Response(res.body, { status: res.status, headers });
    };

    if (path === '/health') {
      const check = allow(`health:${clientKey(request)}`, LIMITS.healthPerMinute, 60000);
      if (!check.allowed) return withCors(jsonError('Too many requests. Try again shortly.', 'RATE_LIMITED', 429, request, env, recoveryFor('RATE_LIMITED')));
      return withCors(jsonOk({
        ok: true, geminiConfigured: Boolean(env.GEMINI_API_KEY), appTokenRequired: Boolean(env.OCTO_APP_TOKEN),
        liveMode: 'still-image-fallback-available', liveTokenEndpoint: 'v1alpha authTokens',
      }, request, env));
    }

    if (path === '/api/usage') {
      if (!checkAppToken(request, env)) return withCors(jsonError('App token is required.', 'UNAUTHORIZED', 401, request, env, 'Enter the OCTO_APP_TOKEN in OCTO Settings, in app memory only.'));
      return withCors(jsonOk({ requests: usage.requests, chatRequests: usage.chatRequests, liveTokens: usage.liveTokens, visionRequests: usage.visionRequests, errors: usage.errors, startedAt: usage.startedAt, note: 'Counts only. No prompts, images, keys, or user content are logged.' }, request, env));
    }

    if (request.method !== 'POST') {
      return withCors(jsonError('Unknown endpoint.', 'NOT_FOUND', 404, request, env, 'Use /health, /api/chat, /api/live-token, /api/vision, or /api/usage.'));
    }
    if (!checkAppToken(request, env)) {
      countError();
      return withCors(jsonError('App token is required.', 'UNAUTHORIZED', 401, request, env, 'Enter the OCTO_APP_TOKEN in OCTO Settings, in app memory only.'));
    }

    if (path === '/api/chat') {
      const check = allow(`chat:${clientKey(request)}`, LIMITS.chatPerMinute, 60000);
      if (!check.allowed) {
        countError();
        return withCors(jsonError('Too many requests. Try again shortly.', 'RATE_LIMITED', 429, request, env, recoveryFor('RATE_LIMITED')));
      }
      if (!env.GEMINI_API_KEY) {
        countError();
        return withCors(jsonError('Gemini secret is not configured on the Worker.', 'MISSING_SECRET', 500, request, env, recoveryFor('MISSING_SECRET')));
      }
      const body = parseJson(await request.text()) as { messages?: unknown; model?: unknown; systemText?: unknown } | null;
      if (!body || !Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 50) {
        countError();
        return withCors(jsonError('Chat request must contain 1 to 50 messages.', 'INVALID_REQUEST', 400, request, env, 'Send a valid chat request from OCTO.'));
      }
      const model = typeof body.model === 'string' && (MODEL_ALLOWLIST as readonly string[]).includes(body.model) ? body.model : 'gemini-2.5-flash';
      const turns: { role: 'user' | 'model'; text: string }[] = [];
      for (const m of body.messages) {
        if (!m || typeof m !== 'object') { countError(); return withCors(jsonError('Each message must be an object with role and text.', 'INVALID_REQUEST', 400, request, env)); }
        const msg = m as { role?: unknown; text?: unknown };
        if ((msg.role !== 'user' && msg.role !== 'model') || typeof msg.text !== 'string' || msg.text.length === 0 || msg.text.length > 8000) {
          countError();
          return withCors(jsonError('Each message needs a user or model role and text up to 8000 characters.', 'INVALID_REQUEST', 400, request, env));
        }
        turns.push({ role: msg.role, text: msg.text });
      }
      usage.chatRequests += 1;
      const systemText = typeof body.systemText === 'string' && body.systemText.length > 0 && body.systemText.length <= 4000 ? body.systemText : SYSTEM_IDENTITY;
      const upstream = await streamGeminiChat(env.GEMINI_API_KEY, model, turns, systemText);
      if (!upstream.ok) countError();
      return withCors(upstream);
    }

    if (path === '/api/live-token') {
      const check = allow(`live:${clientKey(request)}`, LIMITS.liveTokensPerHour, 3600000);
      if (!check.allowed) {
        countError();
        return withCors(jsonError('Too many Live token requests. Try again later.', 'RATE_LIMITED', 429, request, env, recoveryFor('RATE_LIMITED')));
      }
      if (!env.GEMINI_API_KEY) {
        countError();
        return withCors(jsonError('Gemini secret is not configured on the Worker.', 'MISSING_SECRET', 500, request, env, recoveryFor('MISSING_SECRET')));
      }
      const result = await createLiveToken(env.GEMINI_API_KEY);
      if (!result.ok) {
        return withCors(jsonOk({ available: false, fallback: 'still-image', reason: result.error || 'Live token endpoint unavailable.', note: 'Full Live WebSocket streaming is not implemented in this slice. Use still-image analysis in Live Vision, labeled as such.' }, request, env));
      }
      usage.liveTokens += 1;
      return withCors(jsonOk({ available: true, token: result.token, expiresAt: result.expiresAt, wsUrl: result.wsUrl, model: result.model, uses: 1, note: 'Short-lived token only. Never use the permanent Worker secret in the frontend.' }, request, env));
    }

    if (path === '/api/vision') {
      const check = allow(`vision:${clientKey(request)}`, LIMITS.visionPerMinute, 60000);
      if (!check.allowed) {
        countError();
        return withCors(jsonError('Too many requests. Try again shortly.', 'RATE_LIMITED', 429, request, env, recoveryFor('RATE_LIMITED')));
      }
      if (!env.GEMINI_API_KEY) {
        countError();
        return withCors(jsonError('Gemini secret is not configured on the Worker.', 'MISSING_SECRET', 500, request, env, recoveryFor('MISSING_SECRET')));
      }
      const body = parseJson(await request.text()) as { imageBase64?: unknown; mimeType?: unknown } | null;
      if (!body || typeof body.imageBase64 !== 'string' || body.imageBase64.length === 0 || body.imageBase64.length > 5000000 || !/^[A-Za-z0-9+/=]+$/.test(body.imageBase64)) {
        countError();
        return withCors(jsonError('Vision request needs a base64 JPEG or PNG image.', 'INVALID_REQUEST', 400, request, env, 'Capture a frame in Live Vision and try again.'));
      }
      const mime = body.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
      usage.visionRequests += 1;
      const result = await analyzeImage(env.GEMINI_API_KEY, body.imageBase64, mime);
      if (!result.ok) {
        countError();
        return withCors(jsonError(result.error?.message || 'Vision analysis failed.', result.error?.code || 'GEMINI_ERROR', result.error?.status || 502, request, env, recoveryFor(result.error?.code || '')));
      }
      return withCors(jsonOk({ analysis: result.text, mode: 'still-image', note: 'Still-image analysis through the Worker, not a Live connection.' }, request, env));
    }

    return withCors(jsonError('Unknown endpoint.', 'NOT_FOUND', 404, request, env, 'Use /health, /api/chat, /api/live-token, /api/vision, or /api/usage.'));
  },
};
