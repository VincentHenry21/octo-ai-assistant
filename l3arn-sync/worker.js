// L3ARN sync Worker (Cloudflare Worker + KV)
// KV binding: L3ARN_STORE (KV namespace "tazaungdaing-tickets", reused)
// L3ARN data lives under keys prefixed "l3arn:" so it never collides with ticket data.
// Auth: a display name plus a 4-digit PIN. Only a SHA-256 hash of the PIN is
// stored, never the PIN itself. The client keeps a token (name + hash) and
// sends it back in the x-l3arn-token header on progress calls.
// Progress shape: {known:{cardIndex:true}, quizBest:{score,total},
//   lastQuiz:{score,total,at}, notes:[{id,text,at}], streak:{count,lastDay}}

const ALLOWED_ORIGINS = ['https://vincenthenry21.github.io', 'https://muse.ai'];

function cors(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-l3arn-token',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(origin) },
  });
}

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function b64url(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return decodeURIComponent(escape(atob(s)));
}

function normName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 40);
}

function validPin(pin) {
  return typeof pin === 'string' && /^\d{4}$/.test(pin);
}

function numField(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.round(n)));
}

// Clean and validate a progress object. Unknown fields are dropped.
function cleanProgress(p) {
  if (!p || typeof p !== 'object') return { known: {}, quizBest: null, lastQuiz: null, notes: [], streak: { count: 0, lastDay: null } };
  const known = {};
  if (p.known && typeof p.known === 'object') {
    for (const k of Object.keys(p.known)) {
      const i = Number(k);
      if (Number.isInteger(i) && i >= 0 && i < 6 && p.known[k]) known[i] = true;
    }
  }
  let quizBest = null;
  if (p.quizBest && typeof p.quizBest === 'object') {
    quizBest = { score: numField(p.quizBest.score, 0, 0, 5), total: numField(p.quizBest.total, 5, 1, 5) };
  }
  let lastQuiz = null;
  if (p.lastQuiz && typeof p.lastQuiz === 'object') {
    lastQuiz = {
      score: numField(p.lastQuiz.score, 0, 0, 5),
      total: numField(p.lastQuiz.total, 5, 1, 5),
      at: typeof p.lastQuiz.at === 'string' ? p.lastQuiz.at.slice(0, 40) : null,
    };
  }
  const notes = [];
  if (Array.isArray(p.notes)) {
    for (const n of p.notes.slice(0, 100)) {
      if (!n || typeof n.text !== 'string') continue;
      notes.push({
        id: typeof n.id === 'string' ? n.id.slice(0, 40) : ('n' + Math.random().toString(36).slice(2, 10)),
        text: n.text.slice(0, 2000),
        at: typeof n.at === 'string' ? n.at.slice(0, 40) : new Date().toISOString(),
      });
    }
  }
  let streak = { count: 0, lastDay: null };
  if (p.streak && typeof p.streak === 'object') {
    streak = {
      count: numField(p.streak.count, 0, 0, 3650),
      lastDay: typeof p.streak.lastDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.streak.lastDay) ? p.streak.lastDay : null,
    };
  }
  return { known, quizBest, lastQuiz, notes, streak };
}

// Verify the token and return the normalized account name, or null.
async function authedName(request, env) {
  const token = request.headers.get('x-l3arn-token');
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  let nameNorm;
  try { nameNorm = unb64url(token.slice(0, dot)); } catch (e) { return null; }
  if (!nameNorm || nameNorm !== normName(nameNorm)) return null;
  const raw = await env.L3ARN_STORE.get('l3arn:account:' + nameNorm);
  if (!raw) return null;
  let acct;
  try { acct = JSON.parse(raw); } catch (e) { return null; }
  if (!acct || typeof acct.pinHash !== 'string') return null;
  const expect = await sha256Hex(nameNorm + ':' + acct.pinHash);
  if (expect !== token.slice(dot + 1)) return null;
  return nameNorm;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    if (url.pathname === '/health') {
      return json({ ok: true }, 200, origin);
    }

    if (request.method === 'POST' && url.pathname === '/auth') {
      const body = await request.json().catch(() => null);
      const nameNorm = normName(body && body.name);
      const pin = body && body.pin;
      if (!nameNorm || nameNorm.length < 2) return json({ ok: false, error: 'bad name' }, 400, origin);
      if (!validPin(pin)) return json({ ok: false, error: 'bad pin' }, 400, origin);
      const pinHash = await sha256Hex('l3arn-pin:' + nameNorm + ':' + pin);
      const key = 'l3arn:account:' + nameNorm;
      const raw = await env.L3ARN_STORE.get(key);
      if (raw) {
        let acct;
        try { acct = JSON.parse(raw); } catch (e) { acct = null; }
        if (!acct || acct.pinHash !== pinHash) {
          return json({ ok: false, error: 'wrong pin' }, 401, origin);
        }
      } else {
        await env.L3ARN_STORE.put(key, JSON.stringify({
          name: String(body.name).trim().slice(0, 40),
          pinHash,
          createdAt: new Date().toISOString(),
        }));
      }
      const token = b64url(nameNorm) + '.' + await sha256Hex(nameNorm + ':' + pinHash);
      return json({ ok: true, token, name: String(body.name).trim().slice(0, 40) }, 200, origin);
    }

    if (request.method === 'GET' && url.pathname === '/progress') {
      const nameNorm = await authedName(request, env);
      if (!nameNorm) return json({ ok: false, error: 'unauthorized' }, 401, origin);
      const raw = await env.L3ARN_STORE.get('l3arn:progress:' + nameNorm);
      let progress = null;
      if (raw) {
        try { progress = cleanProgress(JSON.parse(raw)); } catch (e) { progress = null; }
      }
      return json({ ok: true, progress }, 200, origin);
    }

    if (request.method === 'POST' && url.pathname === '/progress') {
      const nameNorm = await authedName(request, env);
      if (!nameNorm) return json({ ok: false, error: 'unauthorized' }, 401, origin);
      const body = await request.json().catch(() => null);
      const progress = cleanProgress(body && body.progress);
      await env.L3ARN_STORE.put('l3arn:progress:' + nameNorm, JSON.stringify(progress));
      return json({ ok: true }, 200, origin);
    }

    if (request.method === 'POST' && url.pathname === '/delete-account') {
      const nameNorm = await authedName(request, env);
      if (!nameNorm) return json({ ok: false, error: 'unauthorized' }, 401, origin);
      await env.L3ARN_STORE.delete('l3arn:account:' + nameNorm);
      await env.L3ARN_STORE.delete('l3arn:progress:' + nameNorm);
      return json({ ok: true }, 200, origin);
    }

    return json({ ok: false, error: 'unknown endpoint' }, 404, origin);
  },
};

// Deploy note: shipped via Workers Builds from Git (root directory l3arn-sync).
