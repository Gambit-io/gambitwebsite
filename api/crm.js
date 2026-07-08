// CRM ingest endpoint for the Gambit sales & marketing platform.
//
// One POST captures a full touchpoint and writes it across the entity/event
// model in analytics/schema.sql: upsert a company (by domain), upsert a contact
// (by email), open-or-advance a deal, and append one immutable event. Everything
// deduplicates so Bogan can fire the same shape on every send without creating
// duplicate companies/contacts.
//
// Reuses the house pattern from api/traces.js: durable Supabase store hit via raw
// PostgREST fetch (no SDK). Same env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY.
// Optional CRM_INGEST_KEY gates writes (recommended — this is real pipeline data,
// not the public demo). If set, callers must send header x-ingest-key.
//
//   POST  /api/crm         write a touchpoint (body below)
//   GET   /api/crm?debug=1 config health check
//
// POST body (every field optional except event.type):
//   {
//     "company": { "name", "domain", "industry", "description", "tags": {} },
//     "contact": { "name", "email", "title", "linkedin_url", "persona": {}, "readiness_score" },
//     "deal":    { "product", "owner", "value_usd", "tags": {} },
//     "event":   { "type", "channel", "actor", "source", "data": {}, "occurred_at" }
//   }
// Returns the resolved { company_id, contact_id, deal_id, event_id }.

const REQUEST_TIMEOUT_MS = 6000;

// Deal funnel order. An event can only push a deal FORWARD, never backward.
const STAGE_ORDER = ['contacted', 'replied', 'meeting', 'applied', 'won', 'lost'];
// Which incoming event types imply a stage.
const EVENT_STAGE = {
  email_sent: 'contacted',
  email_replied: 'replied',
  meeting_booked: 'meeting',
};

function getConfig() {
  // Prefer a dedicated CRM project; fall back to the shared vars traces.js uses.
  // Set CRM_SUPABASE_* only if the CRM lives in a different Supabase project than
  // the Clearstep traces store (recommended, to keep real pipeline data separate).
  const url = process.env.CRM_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.CRM_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  const cleanUrl = url.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/i, '').replace(/\/+$/, '');
  return { url: cleanUrl, key: key.trim() };
}

function sbHeaders(cfg, extra) {
  return { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json', ...(extra || {}) };
}

function withTimeout(fn) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), REQUEST_TIMEOUT_MS);
  return Promise.resolve(fn(c.signal)).finally(() => clearTimeout(t));
}

// Thin PostgREST wrapper. Returns parsed rows (array) or throws with context.
async function sb(cfg, method, path, { body, prefer, signal } = {}) {
  const res = await fetch(`${cfg.url}/rest/v1/${path}`, {
    method,
    headers: sbHeaders(cfg, prefer ? { Prefer: prefer } : undefined),
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`supabase ${method} ${path} -> ${res.status} ${t.slice(0, 300)}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

const lower = (v) => (typeof v === 'string' && v.trim() ? v.trim().toLowerCase() : null);
const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ''));

// Find a row by an exact column match, or return null.
async function findOne(cfg, table, col, val, signal) {
  if (!val) return null;
  const rows = await sb(cfg, 'GET', `${table}?${col}=eq.${encodeURIComponent(val)}&select=*&limit=1`, { signal });
  return rows[0] || null;
}

async function insert(cfg, table, row, signal) {
  const rows = await sb(cfg, 'POST', table, { body: row, prefer: 'return=representation', signal });
  return rows[0];
}

async function patch(cfg, table, id, row, signal) {
  if (!Object.keys(row).length) return;
  await sb(cfg, 'PATCH', `${table}?id=eq.${id}`, { body: row, prefer: 'return=minimal', signal });
}

async function ingest(cfg, body, signal) {
  const out = {};

  // ── COMPANY (dedupe by domain) ───────────────────────────────────────────
  let company = null;
  if (body.company && (body.company.domain || body.company.name)) {
    const domain = lower(body.company.domain);
    const fields = clean({
      name: body.company.name,
      domain,
      industry: body.company.industry,
      description: body.company.description,
    });
    company = domain ? await findOne(cfg, 'companies', 'domain', domain, signal) : null;
    if (company) {
      // Fill blanks + merge tags; never clobber an existing name with nothing.
      const upd = clean({ industry: fields.industry, description: fields.description });
      if (body.company.tags) upd.tags = { ...(company.tags || {}), ...body.company.tags };
      await patch(cfg, 'companies', company.id, upd, signal);
    } else {
      company = await insert(cfg, 'companies', { ...fields, name: fields.name || domain, tags: body.company.tags || {} }, signal);
    }
    out.company_id = company.id;
  }

  // ── CONTACT (dedupe by email) ────────────────────────────────────────────
  let contact = null;
  if (body.contact && (body.contact.email || body.contact.name)) {
    const email = lower(body.contact.email);
    const fields = clean({
      company_id: out.company_id,
      name: body.contact.name,
      email,
      title: body.contact.title,
      linkedin_url: body.contact.linkedin_url,
      persona: body.contact.persona,
      readiness_score: body.contact.readiness_score,
    });
    contact = email ? await findOne(cfg, 'contacts', 'email', email, signal) : null;
    if (contact) {
      const upd = clean({
        company_id: contact.company_id || out.company_id,
        title: fields.title,
        linkedin_url: fields.linkedin_url,
        persona: fields.persona,
        readiness_score: fields.readiness_score,
      });
      if (body.contact.tags) upd.tags = { ...(contact.tags || {}), ...body.contact.tags };
      await patch(cfg, 'contacts', contact.id, upd, signal);
    } else {
      contact = await insert(cfg, 'contacts', { ...fields, tags: body.contact.tags || {} }, signal);
    }
    out.contact_id = contact.id;
  }

  // ── DEAL (one open deal per company+product; advance forward only) ────────
  const evType = body.event && body.event.type;
  const impliedStage = EVENT_STAGE[evType];
  if (body.deal && body.deal.product && out.company_id) {
    const product = body.deal.product;
    const rows = await sb(
      cfg, 'GET',
      `deals?company_id=eq.${out.company_id}&product=eq.${encodeURIComponent(product)}&order=created_at.desc&select=*&limit=1`,
      { signal },
    );
    let deal = rows[0];
    if (!deal) {
      deal = await insert(cfg, 'deals', clean({
        company_id: out.company_id,
        contact_id: out.contact_id,
        product,
        stage: impliedStage || 'contacted',
        owner: body.deal.owner,
        value_usd: body.deal.value_usd,
        tags: body.deal.tags || {},
      }), signal);
    } else if (impliedStage) {
      // Advance only if the implied stage is further along than the current one.
      const cur = STAGE_ORDER.indexOf(deal.stage);
      const next = STAGE_ORDER.indexOf(impliedStage);
      if (next > cur) await patch(cfg, 'deals', deal.id, { stage: impliedStage }, signal);
    }
    out.deal_id = deal.id;
  }

  // ── EVENT (always append) ────────────────────────────────────────────────
  if (evType) {
    const event = await insert(cfg, 'events', clean({
      type: evType,
      occurred_at: body.event.occurred_at,
      company_id: out.company_id,
      contact_id: out.contact_id,
      deal_id: out.deal_id,
      channel: body.event.channel,
      source: body.event.source,
      actor: body.event.actor,
      data: body.event.data || {},
    }), signal);
    out.event_id = event.id;
  }

  return out;
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const allowed = ['https://gambitco.io', 'https://www.gambitco.io', 'https://analytics.gambitco.io'];
  if (process.env.VERCEL_ENV !== 'production') allowed.push('http://localhost:3000', 'http://localhost:8099');
  if (origin.endsWith('.vercel.app')) allowed.push(origin);
  if (allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-ingest-key');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (origin && !allowed.includes(origin)) return res.status(403).json({ error: 'Forbidden origin' });

  const cfg = getConfig();

  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://x');
    if (url.searchParams.get('debug')) {
      return res.status(200).json({ configured: !!cfg, gated: !!process.env.CRM_INGEST_KEY });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Shared-secret gate. If CRM_INGEST_KEY is set, writes require the header.
  const gate = process.env.CRM_INGEST_KEY;
  if (gate && req.headers['x-ingest-key'] !== gate) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!cfg) return res.status(503).json({ error: 'Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY)' });

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { return res.status(400).json({ error: 'Invalid body' }); }
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Missing body' });
  if (!body.event || !body.event.type) return res.status(400).json({ error: 'event.type is required' });

  try {
    const result = await withTimeout((signal) => ingest(cfg, body, signal));
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('[crm] ingest error', err);
    return res.status(502).json({ error: 'Ingest failed', detail: String(err.message || err).slice(0, 300) });
  }
}
