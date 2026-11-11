// L3ARN sync Worker (Cloudflare Worker + KV)
// KV binding: L3ARN_STORE (KV namespace "tazaungdaing-tickets", reused)
// L3ARN data lives under keys prefixed "l3arn:" so it never collides with ticket data.
// Auth: a display name plus a 4-digit PIN. Only a SHA-256 hash of the PIN is
// stored, never the PIN itself. The client keeps a token (name + hash) and
// sends it back in the x-l3arn-token header on progress calls.
// AI help: POST /api/ai forwards a study question to Google Gemini
// (model gemini-3-flash-preview) using the GEMINI_API_KEY secret stored in
// the Worker environment (server-side only, never in the page). The secret is
// NOT set yet; when it is missing the endpoint answers { ok:false,
// error:"not_configured" } so the app shows a clear "not set up yet" message.
// A { status:true } body only checks whether the key is configured, and never
// calls Gemini. Rate limited to 10 questions per minute per IP.
// Progress shape (per subject, namespaced):
//   { active:"teamproject", subjects:{ teamproject:{known,quizBest,lastQuiz,notes,streak}, ... },
//     playlist:[videoId], watchHistory:[{videoId,at}],
//     profile:{ name, gender:"male"|"female"|null, academicYear:1-4, picture:data:image/jpeg;base64 } }
// Each subject value keeps the original flat shape:
//   {known:{cardIndex:true}, quizBest:{score,total},
//    lastQuiz:{score,total,at}, notes:[note], streak:{count,lastDay}}
// A note is either the old plain-text shape {id,text,at} or the new block shape
//   {id,title,blocks:[{id,type:"h1"|"p"|"bullet"|"number"|"check"|"divider",text,checked}],
//    drawing:data:image/png;base64 (capped 120000 chars), grid:true|false, at, updatedAt}
// Backward compatible: a flat old-shape object is treated as Unit 8 (teamproject) progress.

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

const SUBJECT_IDS = ['teamproject', 'entrepreneurship', 'marketing', 'finance'];

function emptySubjectProgress() {
  return { known: {}, quizBest: null, lastQuiz: null, notes: [], streak: { count: 0, lastDay: null } };
}

// Clean and validate one subject's progress object. Unknown fields are dropped.
function cleanSubject(p) {
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
      if (!n || typeof n !== 'object') continue;
      const nid = typeof n.id === 'string' ? n.id.slice(0, 40) : ('n' + Math.random().toString(36).slice(2, 10));
      const nat = typeof n.at === 'string' ? n.at.slice(0, 40) : new Date().toISOString();
      const nupd = typeof n.updatedAt === 'string' ? n.updatedAt.slice(0, 40) : nat;
      // Block note (new shape): headings, paragraphs, lists, checkboxes, dividers,
      // plus an optional drawing (data URL, capped) and the grid-paper flag.
      if (Array.isArray(n.blocks)) {
        const blocks = [];
        for (const b of n.blocks.slice(0, 100)) {
          if (!b || typeof b !== 'object') continue;
          const type = ['h1', 'p', 'bullet', 'number', 'check', 'divider'].includes(b.type) ? b.type : 'p';
          blocks.push({
            id: typeof b.id === 'string' ? b.id.slice(0, 40) : ('b' + Math.random().toString(36).slice(2, 10)),
            type,
            text: typeof b.text === 'string' ? b.text.slice(0, 2000) : '',
            checked: type === 'check' ? !!b.checked : false,
          });
        }
        const note = { id: nid, blocks, at: nat, updatedAt: nupd };
        if (typeof n.title === 'string') note.title = n.title.slice(0, 120);
        if (typeof n.drawing === 'string' && n.drawing.startsWith('data:image/') && n.drawing.length <= 120000) note.drawing = n.drawing;
        if (typeof n.grid === 'boolean') note.grid = n.grid;
        notes.push(note);
        continue;
      }
      // Old plain-text note: keep as is.
      if (typeof n.text !== 'string') continue;
      notes.push({ id: nid, text: n.text.slice(0, 2000), at: nat });
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

// Clean and validate the profile object. Unknown fields are dropped.
// The picture is a small client-side resized JPEG data URL (200x200), capped
// at 150,000 characters so one account stays light in KV, or one of the four
// built-in default avatar paths (assets/avatar-1.png to avatar-4.png).
function cleanProfile(p) {
  const d = { name: '', gender: null, academicYear: 1, picture: null };
  if (!p || typeof p !== 'object') return d;
  if (typeof p.name === 'string') d.name = p.name.slice(0, 40);
  if (p.gender === 'male' || p.gender === 'female') d.gender = p.gender;
  d.academicYear = numField(p.academicYear, 1, 1, 4);
  if (typeof p.picture === 'string' && p.picture.length <= 150000 &&
      (p.picture.startsWith('data:image/') || /^assets\/avatar-[1-4]\.png$/.test(p.picture))) {
    d.picture = p.picture;
  }
  return d;
}

// Clean a list of saved YouTube video ids (max 100, de-duplicated).
function cleanVideoList(v) {
  if (!Array.isArray(v)) return [];
  const seen = new Set();
  const out = [];
  for (const id of v.slice(0, 100)) {
    if (typeof id !== 'string' || seen.has(id)) continue;
    seen.add(id);
    out.push(id.slice(0, 32));
  }
  return out;
}

// Clean the watch history (max 200 entries, newest first).
function cleanHistory(h) {
  if (!Array.isArray(h)) return [];
  const out = [];
  for (const item of h.slice(0, 200)) {
    if (!item || typeof item.videoId !== 'string') continue;
    out.push({
      videoId: item.videoId.slice(0, 32),
      at: typeof item.at === 'string' ? item.at.slice(0, 40) : new Date().toISOString(),
    });
  }
  return out;
}

// Clean and validate the whole per-subject store. Unknown fields are dropped.
function cleanProgress(p) {
  if (!p || typeof p !== 'object') {
    const subjects = {};
    for (const id of SUBJECT_IDS) subjects[id] = emptySubjectProgress();
    return { active: 'teamproject', subjects, playlist: [], watchHistory: [], profile: cleanProfile(null) };
  }
  if (p.subjects && typeof p.subjects === 'object') {
    const subjects = {};
    for (const id of SUBJECT_IDS) subjects[id] = cleanSubject(p.subjects[id]);
    const active = typeof p.active === 'string' && subjects[p.active] ? p.active : 'teamproject';
    return {
      active,
      subjects,
      playlist: cleanVideoList(p.playlist),
      watchHistory: cleanHistory(p.watchHistory),
      profile: cleanProfile(p.profile),
    };
  }
  // Old flat shape: it is Unit 8's progress.
  const subjects = {};
  for (const id of SUBJECT_IDS) subjects[id] = emptySubjectProgress();
  subjects.teamproject = cleanSubject(p);
  return { active: 'teamproject', subjects, playlist: [], watchHistory: [], profile: cleanProfile(null) };
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

// Simple per-IP rate limit for the AI endpoint: 10 requests per minute.
// Kept in memory per isolate; the map is capped so it cannot grow forever.
const AI_RATE = new Map();
function aiRateLimited(ip) {
  const now = Date.now();
  const recent = (AI_RATE.get(ip) || []).filter((ts) => now - ts < 60000);
  if (recent.length >= 10) return true;
  recent.push(now);
  AI_RATE.set(ip, recent);
  if (AI_RATE.size > 5000) AI_RATE.clear();
  return false;
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

    if (url.pathname === '/api/ai') {
      if (request.method !== 'POST') {
        return json({ ok: false, error: 'method not allowed' }, 405, origin);
      }
      const body = await request.json().catch(() => null);
      const apiKey = (env.GEMINI_API_KEY || '').trim();
      // Config probe: never calls Gemini, only reports whether the key exists.
      if (body && body.status === true) {
        return json({ ok: true, configured: apiKey.length > 0 }, 200, origin);
      }
      if (!apiKey) {
        return json({ ok: false, error: 'not_configured' }, 200, origin);
      }
      const question = body && typeof body.question === 'string' ? body.question.trim() : '';
      if (!question) {
        return json({ ok: false, error: 'empty question' }, 400, origin);
      }
      if (question.length > 2000) {
        return json({ ok: false, error: 'question too long' }, 400, origin);
      }
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      if (aiRateLimited(ip)) {
        return json({ ok: false, error: 'rate_limited' }, 429, origin);
      }
      const prompt =
        'You are a friendly study tutor for a BBA Year 1 student at a college in Myanmar. ' +
        'Answer in plain, simple English. Reply in plain text only: no markdown, no headings, ' +
        'no bold or italics, no asterisks, no hashtags. Explain the concept step by step, give a short ' +
        'example when it helps, and end with one practical tip the student can use in their ' +
        'assignment. Do not write the student\'s assignment for them. Keep the answer under 400 words.\n\n' +
        'Student question: ' + question;
      let res;
      try {
        res = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
            }),
          }
        );
      } catch (e) {
        return json({ ok: false, error: 'upstream' }, 502, origin);
      }
      if (!res.ok) {
        return json({ ok: false, error: 'upstream' }, 502, origin);
      }
      const data = await res.json().catch(() => null);
      let answer = '';
      try {
        const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
        if (Array.isArray(parts)) answer = parts.map((p) => p.text || '').join('');
      } catch (e) { answer = ''; }
      if (!answer) {
        return json({ ok: false, error: 'upstream' }, 502, origin);
      }
      return json({ ok: true, answer: answer.slice(0, 8000) }, 200, origin);
    }

    return json({ ok: false, error: 'unknown endpoint' }, 404, origin);
  },
};

// Deploy note: shipped via Workers Builds from Git (root directory l3arn-sync).
