// Tazaungdaing ticket sync Worker (Cloudflare Worker + KV)
// KV binding: TICKETS (KV namespace "tazaungdaing-tickets")
// Secret: TICKET_PIN (set in the Cloudflare dashboard, never in code)
// Data: ticket:<ID> -> JSON {id, buyer, phone, cashback, status, issuedAt, redeemedAt, updatedAt, entries, entriesUsed, price}
// Deleted IDs are kept in KV key "deleted-ids" (a JSON array) so a device
// that still holds a deleted ticket in localStorage cannot re-upload it.
// The app sends the PIN the user typed to unlock the app in the x-ticket-pin header.

const ALLOWED_ORIGINS = ['https://vincenthenry21.github.io'];

function cors(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-ticket-pin',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(origin) },
  });
}

function authed(request, env) {
  const pin = request.headers.get('x-ticket-pin');
  return Boolean(pin) && Boolean(env.TICKET_PIN) && pin === env.TICKET_PIN;
}

function validId(id) {
  return typeof id === 'string' && /^NMA-TZF26-[A-Z0-9]{6}$/.test(id);
}

function numField(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function cleanTicket(t) {
  if (!t || !validId(t.id)) return null;
  const entries = numField(t.entries, 1, 1, 10);
  return {
    id: t.id,
    buyer: String(t.buyer || ''),
    phone: String(t.phone || ''),
    cashback: Number.isFinite(+t.cashback) ? Math.max(0, Math.min(300, Math.round(+t.cashback))) : 0,
    status: t.status === 'redeemed' ? 'redeemed' : 'waiting',
    issuedAt: t.issuedAt || null,
    redeemedAt: t.redeemedAt || null,
    updatedAt: t.updatedAt || Date.now(),
    entries,
    entriesUsed: numField(t.entriesUsed, 0, 0, entries),
    price: numField(t.price, 10000, 0, 10000000),
  };
}

// Redeemed always wins over waiting. Same status: the fresher record wins,
// except entries used only ever grows, so the higher count wins.
function mergeTicket(server, incoming) {
  if (!server) return incoming;
  if (server.status === 'redeemed' && incoming.status !== 'redeemed') return server;
  if (incoming.status === 'redeemed' && server.status !== 'redeemed') return incoming;
  const base = (incoming.updatedAt || 0) >= (server.updatedAt || 0) ? incoming : server;
  return {
    ...base,
    entries: Math.max(server.entries || 1, incoming.entries || 1),
    entriesUsed: Math.max(server.entriesUsed || 0, incoming.entriesUsed || 0),
    price: Math.max(server.price || 10000, incoming.price || 10000),
  };
}

// IDs of tickets that were deleted. A device that still holds one of these
// in localStorage must not be able to re-upload it.
async function getDeleted(env) {
  const raw = await env.TICKETS.get('deleted-ids');
  if (!raw) return new Set();
  try {
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []);
  } catch (e) {
    return new Set();
  }
}

async function addDeleted(env, id) {
  const set = await getDeleted(env);
  set.add(id);
  await env.TICKETS.put('deleted-ids', JSON.stringify([...set]));
  return set;
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

    if (!authed(request, env)) {
      return json({ ok: false, error: 'wrong pin' }, 401, origin);
    }

    if (request.method === 'GET' && url.pathname === '/tickets') {
      const list = await env.TICKETS.list({ prefix: 'ticket:' });
      const out = [];
      for (const k of list.keys) {
        const v = await env.TICKETS.get(k.name);
        if (!v) continue;
        try { out.push(JSON.parse(v)); } catch (e) { /* skip bad record */ }
      }
      out.sort((a, b) => String(a.issuedAt || '').localeCompare(String(b.issuedAt || '')));
      const deleted = await getDeleted(env);
      return json({ ok: true, tickets: out, deleted: [...deleted] }, 200, origin);
    }

    if (request.method === 'POST' && url.pathname === '/tickets') {
      const t = cleanTicket(await request.json().catch(() => null));
      if (!t) return json({ ok: false, error: 'bad ticket' }, 400, origin);
      const deleted = await getDeleted(env);
      if (deleted.has(t.id)) return json({ ok: false, error: 'deleted' }, 200, origin);
      const cur = await env.TICKETS.get('ticket:' + t.id);
      const merged = mergeTicket(cur ? JSON.parse(cur) : null, t);
      await env.TICKETS.put('ticket:' + t.id, JSON.stringify(merged));
      return json({ ok: true, ticket: merged }, 200, origin);
    }

    if (request.method === 'POST' && url.pathname === '/sync') {
      const body = await request.json().catch(() => null);
      const arr = Array.isArray(body && body.tickets) ? body.tickets : [];
      const deleted = await getDeleted(env);
      let saved = 0;
      let skipped = 0;
      for (const raw of arr) {
        const t = cleanTicket(raw);
        if (!t) continue;
        if (deleted.has(t.id)) { skipped += 1; continue; }
        const cur = await env.TICKETS.get('ticket:' + t.id);
        const merged = mergeTicket(cur ? JSON.parse(cur) : null, t);
        await env.TICKETS.put('ticket:' + t.id, JSON.stringify(merged));
        saved += 1;
      }
      return json({ ok: true, saved, skipped }, 200, origin);
    }

    if (request.method === 'POST' && url.pathname === '/delete') {
      const body = await request.json().catch(() => null);
      const id = body && body.id;
      if (!validId(id)) return json({ ok: false, error: 'bad id' }, 400, origin);
      await env.TICKETS.delete('ticket:' + id);
      const set = await addDeleted(env, id);
      return json({ ok: true, deleted: [...set] }, 200, origin);
    }

    if (request.method === 'POST' && url.pathname === '/redeem') {
      const body = await request.json().catch(() => null);
      const id = body && body.id;
      if (!validId(id)) return json({ ok: false, error: 'bad id' }, 400, origin);
      const cur = await env.TICKETS.get('ticket:' + id);
      if (!cur) return json({ ok: false, error: 'not found' }, 404, origin);
      const t = JSON.parse(cur);
      if (t.status === 'redeemed') return json({ ok: true, ticket: t, alreadyRedeemed: true }, 200, origin);
      t.status = 'redeemed';
      t.redeemedAt = new Date().toISOString();
      t.updatedAt = Date.now();
      await env.TICKETS.put('ticket:' + id, JSON.stringify(t));
      return json({ ok: true, ticket: t }, 200, origin);
    }

    return json({ ok: false, error: 'unknown endpoint' }, 404, origin);
  },
};

// Deploy note: shipped via Workers Builds from Git.
