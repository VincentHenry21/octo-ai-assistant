// Best-effort per-isolate token bucket. Cloudflare Workers isolates do not share
// this memory, so also use Cloudflare Dashboard rate limiting for a hard global cap.
// Limits are documented in backend/README.md and in the 429 response.
interface Bucket { count: number; resetAt: number; }
const buckets = new Map<string, Bucket>();

export function clientKey(request: Request): string {
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || 'unknown';
  const token = request.headers.get('X-Octo-App-Token') || 'no-token';
  return `${ip}:${token.slice(0, 8)}`;
}

export function allow(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (bucket.count < limit) {
    bucket.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }
  return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
}

export const LIMITS = {
  chatPerMinute: 20,
  visionPerMinute: 20,
  liveTokensPerHour: 10,
  usagePerMinute: 60,
  healthPerMinute: 60,
};
