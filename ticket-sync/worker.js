// Tazaungdaing ticket sync Worker (Cloudflare Worker + KV)
// KV binding: TICKETS (KV namespace "tazaungdaing-tickets")
// Secret: TICKET_PIN (set in the Cloudflare dashboard, never in code)
// Data: ticket:<ID> -> JSON {id, buyer, phone, cashback, status, issuedAt, redeemedAt, updatedAt}
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

function cleanTicket(t) {
  if (!t || !validId(t.id)) return null;
  return {
    id: t.id,
    buyer: String(t.buyer || ''),
    phone: String(t.phone || ''),
    cashback: Number.isFinite(+t.cashback) ? Math.max(0, Math.min(300, Math.round(+t.cashback))) : 0,
    status: t.status === 'redeemed' ? 'redeemed' : 'waiting',
    issuedAt: t.issuedAt || null,
    redeemedAt: t.redeemedAt || null,
    updatedAt: t.updatedAt || Date.now(),
  };
}

// Redeemed always wins over waiting. Same status: the fresher record wins.
function mergeTicket(server, incoming) {
  if (!server) return incoming;
  if (server.status === 'redeemed' && incoming.status !== 'redeemed') return server;
  if (incoming.status === 'redeemed' && server.status !== 'redeemed') return incoming;
  return (incoming.updatedAt || 0) >= (server.updatedAt || 0) ? incoming : server;
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
      return json({ ok: true, tickets: out }, 200, origin);
    }

    if (request.method === 'POST' && url.pathname === '/tickets') {
      const t = cleanTicket(await request.json().catch(() => null));
      if (!t) return json({ ok: false, error: 'bad ticket' }, 400, origin);
      const cur = await env.TICKETS.get('ticket:' + t.id);
      const merged = mergeTicket(cur ? JSON.parse(cur) : null, t);
      await env.TICKETS.put('ticket:' + t.id, JSON.stringify(merged));
      return json({ ok: true, ticket: merged }, 200, origin);
    }

    if (request.method === 'POST' && url.pathname === '/sync') {
      const body = await request.json().catch(() => null);
      const arr = Array.isArray(body && body.tickets) ? body.tickets : [];
      let saved = 0;
      for (const raw of arr) {
        const t = cleanTicket(raw);
        if (!t) continue;
        const cur = await env.TICKETS.get('ticket:' + t.id);
        const merged = mergeTicket(cur ? JSON.parse(cur) : null, t);
        await env.TICKETS.put('ticket:' + t.id, JSON.stringify(merged));
        saved += 1;
      }
      return json({ ok: true, saved }, 200, origin);
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
