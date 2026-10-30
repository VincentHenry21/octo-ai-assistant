import type { Env } from './types';

export const DEFAULT_ORIGIN = 'https://vincenthenry21.github.io';
const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:4173', 'https://localhost:5173'];

export function allowedOrigins(env: Env): string[] {
  const configured = (env.ALLOWED_ORIGIN || DEFAULT_ORIGIN).split(',').map((s) => s.trim()).filter(Boolean);
  return [...new Set([...configured, ...DEV_ORIGINS])];
}

export function isAllowedOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  return allowedOrigins(env).includes(origin);
}

export function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  const allowed = allowedOrigins(env).includes(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Octo-App-Token',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function checkAppToken(request: Request, env: Env): boolean {
  if (!env.OCTO_APP_TOKEN) return true;
  const presented = request.headers.get('X-Octo-App-Token') || '';
  return presented.length > 0 && presented === env.OCTO_APP_TOKEN;
}

export function handlePreflight(request: Request, env: Env): Response | null {
  if (request.method !== 'OPTIONS') return null;
  if (!isAllowedOrigin(request, env)) return jsonError('Origin is not allowed.', 'FORBIDDEN', 403, request, env);
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
}

export function jsonError(message: string, code: string, status: number, request: Request, env: Env, recovery?: string): Response {
  return new Response(JSON.stringify({ error: message, code, recovery: recovery || '' }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request, env) },
  });
}

export function jsonOk(data: Record<string, unknown>, request: Request, env: Env, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request, env) },
  });
}
