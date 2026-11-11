// L3ARN sync Worker (Cloudflare Worker + KV)
// KV binding: L3ARN_STORE (KV namespace "tazaungdaing-tickets", reused)
// L3ARN data lives under keys prefixed "l3arn:" so it never collides with ticket data.
// Auth: a display name, a unique username, an age, and a 4-digit PIN.
// Only a SHA-256 hash of the PIN is stored, never the PIN itself. Sign-in
// checks all three: the PIN, the name, and the username must match the
// account stored under that username. The client keeps a token
// (username + hash) and sends it back in the x-l3arn-token header on
// progress calls. Accounts created before usernames existed (keyed by name
// only) migrate to the username on first sign-in with a username, and their
// progress moves with them.
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
//     profile:{ name, username, age, gender:"male"|"female"|null, academicYear:1-4, picture:data:image/jpeg;base64,
//              college, course, major (strings, max 80 chars) },
//     customSubjects:[{id, name, course}] (user-added subjects, max 50) }
// Each subject value keeps the original flat shape:
//   {known:{cardIndex:true}, quizBest:{score,total},
//    lastQuiz:{score,total,at}, notes:[note], streak:{count,lastDay},
//    studySeconds:0 (ranking), uploaded:{cards:[{q,a}], lesson, sourceName, at}|null,
//    uploadedKnown:{cardIndex:true}}
// AI generation: POST /api/generate {text, subject} turns uploaded PDF or
// textbook text (max 8000 chars) into up to 12 flashcards plus a lesson,
// using the same GEMINI_API_KEY secret. Rate limited to 5 per minute per IP.
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

// A username is 3 to 30 lowercase letters, digits, or underscores.
function normUsername(u) {
  const s = String(u || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30);
  return s.length >= 3 ? s : null;
}

function cleanAge(a) {
  const n = Number(a);
  if (!Number.isFinite(n)) return null;
  return Math.max(5, Math.min(120, Math.round(n)));
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
  return { known: {}, quizBest: null, lastQuiz: null, notes: [], streak: { count: 0, lastDay: null }, studySeconds: 0, uploaded: null, uploadedKnown: {} };
}

// Clean and validate one subject's progress object. Unknown fields are dropped.
function cleanSubject(p) {
  if (!p || typeof p !== 'object') return { known: {}, quizBest: null, lastQuiz: null, notes: [], streak: { count: 0, lastDay: null }, studySeconds: 0, uploaded: null, uploadedKnown: {} };
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
  // Study time (seconds) for the ranking system, and uploaded AI material
  // (flashcards + lesson generated from a PDF or textbook the user uploaded).
  let studySeconds = 0;
  if (typeof p.studySeconds === 'number' && Number.isFinite(p.studySeconds)) {
    studySeconds = Math.max(0, Math.min(99999999, Math.floor(p.studySeconds)));
  }
  let uploaded = null;
  if (p.uploaded && typeof p.uploaded === 'object') {
    const cards = [];
    if (Array.isArray(p.uploaded.cards)) {
      for (const c of p.uploaded.cards.slice(0, 12)) {
        if (!c || typeof c !== 'object') continue;
        if (typeof c.q !== 'string' || typeof c.a !== 'string') continue;
        cards.push({ q: c.q.slice(0, 300), a: c.a.slice(0, 600) });
      }
    }
    uploaded = {
      cards,
      lesson: typeof p.uploaded.lesson === 'string' ? p.uploaded.lesson.slice(0, 6000) : '',
      sourceName: typeof p.uploaded.sourceName === 'string' ? p.uploaded.sourceName.slice(0, 120) : '',
      at: typeof p.uploaded.at === 'string' ? p.uploaded.at.slice(0, 40) : new Date().toISOString(),
    };
  }
  const uploadedKnown = {};
  if (p.uploadedKnown && typeof p.uploadedKnown === 'object') {
    for (const k of Object.keys(p.uploadedKnown)) {
      const i = Number(k);
      if (Number.isInteger(i) && i >= 0 && i < 12 && p.uploadedKnown[k]) uploadedKnown[i] = true;
    }
  }
  return { known, quizBest, lastQuiz, notes, streak, studySeconds, uploaded, uploadedKnown };
}

// Clean and validate the profile object. Unknown fields are dropped.
// The picture is a small client-side resized JPEG data URL (200x200), capped
// at 150,000 characters so one account stays light in KV, or one of the four
// built-in default avatar paths (assets/avatar-1.png to avatar-4.png).
function cleanProfile(p) {
  const d = { name: '', gender: null, academicYear: 1, picture: null, college: '', course: '', major: '', username: '', age: null };
  if (!p || typeof p !== 'object') return d;
  if (typeof p.name === 'string') d.name = p.name.slice(0, 40);
  if (typeof p.username === 'string') d.username = p.username.slice(0, 40);
  if (typeof p.age === 'number' && Number.isFinite(p.age)) d.age = Math.max(0, Math.min(120, Math.round(p.age)));
  if (p.gender === 'male' || p.gender === 'female') d.gender = p.gender;
  d.academicYear = numField(p.academicYear, 1, 1, 4);
  if (typeof p.college === 'string') d.college = p.college.slice(0, 80);
  if (typeof p.course === 'string') d.course = p.course.slice(0, 80);
  if (typeof p.major === 'string') d.major = p.major.slice(0, 80);
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

// Clean the custom-subject registry: [{id, name, course}], max 50.
// Ids are client-generated (c-<slug>-<4 chars>) and must be well-formed.
function cleanCustomSubjects(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  const seen = new Set();
  for (const s of v.slice(0, 50)) {
    if (!s || typeof s !== 'object') continue;
    if (typeof s.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,59}$/.test(s.id) || seen.has(s.id)) continue;
    seen.add(s.id);
    out.push({
      id: s.id,
      name: typeof s.name === 'string' ? s.name.slice(0, 80) : '',
      course: typeof s.course === 'string' ? s.course.slice(0, 80) : '',
    });
  }
  return out;
}

// Clean and validate the whole per-subject store. Unknown fields are dropped.
// Besides the four built-in subjects, any extra subject id that is well-formed
// (lowercase letters, digits, hyphens, max 60 chars) is accepted, so preset
// catalog subjects and user-added custom subjects sync too (max 60 total).
function cleanProgress(p) {
  if (!p || typeof p !== 'object') {
    const subjects = {};
    for (const id of SUBJECT_IDS) subjects[id] = emptySubjectProgress();
    return { active: 'teamproject', subjects, customSubjects: [], playlist: [], watchHistory: [], profile: cleanProfile(null) };
  }
  if (p.subjects && typeof p.subjects === 'object') {
    const subjects = {};
    for (const id of SUBJECT_IDS) subjects[id] = cleanSubject(p.subjects[id]);
    let extra = 0;
    for (const id of Object.keys(p.subjects)) {
      if (subjects[id] || extra >= 56) continue;
      if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(id)) continue;
      subjects[id] = cleanSubject(p.subjects[id]);
      extra++;
    }
    const active = typeof p.active === 'string' && subjects[p.active] ? p.active : 'teamproject';
    return {
      active,
      subjects,
      customSubjects: cleanCustomSubjects(p.customSubjects),
      playlist: cleanVideoList(p.playlist),
      watchHistory: cleanHistory(p.watchHistory),
      profile: cleanProfile(p.profile),
    };
  }
  // Old flat shape: it is Unit 8's progress.
  const subjects = {};
  for (const id of SUBJECT_IDS) subjects[id] = emptySubjectProgress();
  subjects.teamproject = cleanSubject(p);
  return { active: 'teamproject', subjects, customSubjects: [], playlist: [], watchHistory: [], profile: cleanProfile(null) };
}

// Verify the token and return the normalized account name, or null.
async function authedName(request, env) {
  const token = request.headers.get('x-l3arn-token');
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  let idNorm;
  try { idNorm = unb64url(token.slice(0, dot)); } catch (e) { return null; }
  if (!idNorm) return null;
  const raw = await env.L3ARN_STORE.get('l3arn:account:' + idNorm);
  if (!raw) return null;
  let acct;
  try { acct = JSON.parse(raw); } catch (e) { return null; }
  if (!acct || typeof acct.pinHash !== 'string') return null;
  // A username-keyed account must be addressed by its username.
  if (typeof acct.username === 'string' && acct.username && acct.username !== idNorm) return null;
  const expect = await sha256Hex(idNorm + ':' + acct.pinHash);
  if (expect !== token.slice(dot + 1)) return null;
  return idNorm;
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

// Generation (PDF/textbook upload) is heavier, so it gets its own stricter
// limit: 5 requests per minute per IP.
const GEN_RATE = new Map();
function genRateLimited(ip) {
  const now = Date.now();
  const recent = (GEN_RATE.get(ip) || []).filter((ts) => now - ts < 60000);
  if (recent.length >= 5) return true;
  recent.push(now);
  GEN_RATE.set(ip, recent);
  if (GEN_RATE.size > 5000) GEN_RATE.clear();
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
      const usernameNorm = normUsername(body && body.username);
      const pin = body && body.pin;
      const age = cleanAge(body && body.age);
      if (!nameNorm || nameNorm.length < 2) return json({ ok: false, error: 'bad name' }, 400, origin);
      if (!usernameNorm) return json({ ok: false, error: 'bad username' }, 400, origin);
      if (!validPin(pin)) return json({ ok: false, error: 'bad pin' }, 400, origin);
      // The PIN hash is derived from the name and PIN (kept name-based so a
      // legacy account migrates without changing its hash).
      const pinHash = await sha256Hex('l3arn-pin:' + nameNorm + ':' + pin);
      const key = 'l3arn:account:' + usernameNorm;
      let raw = await env.L3ARN_STORE.get(key);
      let acct = null;
      if (raw) {
        try { acct = JSON.parse(raw); } catch (e) { acct = null; }
      }
      if (acct && typeof acct.pinHash === 'string') {
        // Strict three-field check: PIN, name, and username must all match.
        if (normName(acct.name) !== nameNorm) {
          return json({ ok: false, error: 'wrong name' }, 401, origin);
        }
        if (acct.pinHash !== pinHash) {
          return json({ ok: false, error: 'wrong pin' }, 401, origin);
        }
        // Fill in the age if the account has none and one was provided.
        if ((acct.age === null || acct.age === undefined) && age !== null) {
          acct.age = age;
          await env.L3ARN_STORE.put(key, JSON.stringify(acct));
        }
        const token = b64url(usernameNorm) + '.' + await sha256Hex(usernameNorm + ':' + acct.pinHash);
        return json({ ok: true, token, name: acct.name, username: usernameNorm, age: acct.age === undefined ? null : acct.age }, 200, origin);
      }
      // No username-keyed account. Try the legacy name-keyed account and
      // migrate it to the username (progress moves with it).
      const legacyKey = 'l3arn:account:' + nameNorm;
      let legacyRaw = null;
      if (legacyKey !== key) legacyRaw = await env.L3ARN_STORE.get(legacyKey);
      let legacy = null;
      if (legacyRaw) {
        try { legacy = JSON.parse(legacyRaw); } catch (e) { legacy = null; }
      }
      if (legacy && typeof legacy.pinHash === 'string' && !legacy.username) {
        if (legacy.pinHash !== pinHash) {
          return json({ ok: false, error: 'wrong pin' }, 401, origin);
        }
        const newAcct = {
          name: legacy.name,
          username: usernameNorm,
          pinHash: legacy.pinHash,
          age: age !== null ? age : (typeof legacy.age === 'number' ? legacy.age : null),
          createdAt: legacy.createdAt || new Date().toISOString(),
          migratedFrom: nameNorm,
        };
        await env.L3ARN_STORE.put(key, JSON.stringify(newAcct));
        const progRaw = await env.L3ARN_STORE.get('l3arn:progress:' + nameNorm);
        if (progRaw) {
          await env.L3ARN_STORE.put('l3arn:progress:' + usernameNorm, progRaw);
          await env.L3ARN_STORE.delete('l3arn:progress:' + nameNorm);
        }
        await env.L3ARN_STORE.delete(legacyKey);
        const token = b64url(usernameNorm) + '.' + await sha256Hex(usernameNorm + ':' + newAcct.pinHash);
        return json({ ok: true, token, name: newAcct.name, username: usernameNorm, age: newAcct.age, migrated: true }, 200, origin);
      }
      // No account at all: create a new one under the username.
      const newAcct = {
        name: String(body.name).trim().slice(0, 40),
        username: usernameNorm,
        pinHash,
        age,
        createdAt: new Date().toISOString(),
      };
      await env.L3ARN_STORE.put(key, JSON.stringify(newAcct));
      const token = b64url(usernameNorm) + '.' + await sha256Hex(usernameNorm + ':' + pinHash);
      return json({ ok: true, token, name: newAcct.name, username: usernameNorm, age }, 200, origin);
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

    // Turn uploaded study material (PDF or textbook text) into flashcards and
    // a lesson. POST {text, subject} -> {ok, cards:[{q,a}], lesson}.
    // The client caps the text at 8000 characters before sending it.
    if (url.pathname === '/api/generate') {
      if (request.method !== 'POST') {
        return json({ ok: false, error: 'method not allowed' }, 405, origin);
      }
      const body = await request.json().catch(() => null);
      const apiKey = (env.GEMINI_API_KEY || '').trim();
      if (body && body.status === true) {
        return json({ ok: true, configured: apiKey.length > 0 }, 200, origin);
      }
      if (!apiKey) {
        return json({ ok: false, error: 'not_configured' }, 200, origin);
      }
      const text = body && typeof body.text === 'string' ? body.text.trim() : '';
      const subject = body && typeof body.subject === 'string' ? body.subject.trim().slice(0, 80) : '';
      if (!text) {
        return json({ ok: false, error: 'empty text' }, 400, origin);
      }
      if (text.length > 8000) {
        return json({ ok: false, error: 'text too long' }, 400, origin);
      }
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      if (genRateLimited(ip)) {
        return json({ ok: false, error: 'rate_limited' }, 429, origin);
      }
      const prompt =
        'You are a study tutor for a BBA Year 1 student at a college in Myanmar. ' +
        'Turn the study material below into flashcards and a short lesson. Reply with JSON only, ' +
        'no other text: {"cards": [{"q": "...", "a": "..."}], "lesson": "..."}. ' +
        'Make at most 12 flashcards. Each question is one clear question, each answer is one or two ' +
        'short sentences in plain simple English. The lesson is a short summary of the material in ' +
        'plain simple English, under 500 words, with the key points. Only use facts from the material ' +
        'below; do not invent facts. If the material is short or unclear, still make the best ' +
        'flashcards you can from what is there.\n\n' +
        'Subject: ' + (subject || 'General') + '\n\nMaterial:\n' + text;
      let res;
      try {
        res = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 2048, temperature: 0.5, responseMimeType: 'application/json' },
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
      let raw = '';
      try {
        const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
        if (Array.isArray(parts)) raw = parts.map((p) => p.text || '').join('');
      } catch (e) { raw = ''; }
      if (!raw) {
        return json({ ok: false, error: 'upstream' }, 502, origin);
      }
      // Tolerate a fenced code block around the JSON.
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
      let parsed = null;
      try { parsed = JSON.parse(cleaned); } catch (e) { parsed = null; }
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.cards) || parsed.cards.length === 0) {
        return json({ ok: false, error: 'bad output' }, 502, origin);
      }
      const cards = [];
      for (const c of parsed.cards.slice(0, 12)) {
        if (!c || typeof c.q !== 'string' || typeof c.a !== 'string') continue;
        if (!c.q.trim() || !c.a.trim()) continue;
        cards.push({ q: c.q.trim().slice(0, 300), a: c.a.trim().slice(0, 600) });
      }
      if (cards.length === 0) {
        return json({ ok: false, error: 'bad output' }, 502, origin);
      }
      const lesson = typeof parsed.lesson === 'string' ? parsed.lesson.slice(0, 6000) : '';
      return json({ ok: true, cards, lesson }, 200, origin);
    }

    return json({ ok: false, error: 'unknown endpoint' }, 404, origin);
  },
};

// Deploy note: shipped via Workers Builds from Git (root directory l3arn-sync).
