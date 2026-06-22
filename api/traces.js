// Synthetic tracing backend for the Clearstep demo.
//
// Records every run (single and batch) so the gated traces viewer can show the
// full history with transcripts, verdicts, and the experience stats. Mirrors
// the ask-twb pattern: durable Supabase store hit via raw PostgREST fetch (no
// SDK), with a per-instance in-memory fallback when Supabase is not configured.
//
//   POST   /api/traces            persist one run  { run, run_type, batch_id }
//   GET    /api/traces            list summaries (newest first)
//   GET    /api/traces?id=xxx     full run detail
//   GET    /api/traces?debug=1    persistence health check
//   DELETE /api/traces            clear all runs
//
// One-time Supabase setup (SQL editor):
//   create table if not exists clearstep_runs (
//     id                text primary key,
//     created_at        timestamptz not null default now(),
//     run_type          text,
//     batch_id          text,
//     complaint         text,
//     expected_endpoint text,
//     chosen_endpoint   text,
//     routing_correct   boolean,
//     severity          text,
//     fidelity_score    integer,
//     comprehension     integer,
//     satisfaction      integer,
//     emotional_shift   integer,
//     summary           jsonb not null,
//     detail            jsonb not null
//   );
//   create index if not exists clearstep_runs_created_idx on clearstep_runs (created_at desc);
// Then set in Vercel: SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_RUNS_TABLE (optional).

const RETENTION = 500;
const REQUEST_TIMEOUT_MS = 6000;

// Per-instance fallback store. Survives within one warm lambda only.
const memory = [];

function getConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  const table = process.env.SUPABASE_RUNS_TABLE || 'clearstep_runs';
  const cleanUrl = url.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/i, '').replace(/\/+$/, '');
  return { url: cleanUrl, key: key.trim(), table: table.trim() };
}

function sbHeaders(cfg, extra) {
  return { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json', ...(extra || {}) };
}

async function withTimeout(fn) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), REQUEST_TIMEOUT_MS);
  try { return await fn(c.signal); } finally { clearTimeout(t); }
}

// Build the durable row from a run object handed up by the browser.
function toRow(body) {
  const run = body.run || {};
  const v = run.verdict || {};
  const id = String(body.id || run.run_id || `${run.id || 'run'}-${Date.now()}`).slice(0, 120);
  const summary = {
    id,
    run_type: body.run_type || 'single',
    batch_id: body.batch_id || null,
    display_name: run.display_name,
    complaint: run.complaint,
    expected_endpoint: run.expected_endpoint,
    chosen_endpoint: run.chosen_endpoint,
    routing_correct: !!run.routing_correct,
    severity: run.severity,
    fidelity_score: run.fidelity_score ?? null,
    comprehension: run.comprehension ?? null,
    satisfaction: run.satisfaction ?? null,
    emotional_shift: run.emotional_shift ?? null,
    turns: run.turns ?? null,
    created_at: body.created_at || new Date().toISOString(),
  };
  return {
    id,
    created_at: summary.created_at,
    run_type: summary.run_type,
    batch_id: summary.batch_id,
    complaint: run.complaint || null,
    expected_endpoint: run.expected_endpoint || null,
    chosen_endpoint: run.chosen_endpoint || null,
    routing_correct: !!run.routing_correct,
    severity: run.severity || null,
    fidelity_score: run.fidelity_score ?? null,
    comprehension: run.comprehension ?? null,
    satisfaction: run.satisfaction ?? null,
    emotional_shift: run.emotional_shift ?? null,
    summary,
    detail: { ...summary, persona_id: run.id, failed: !!run.failed, verdict: v, transcript: run.transcript || [] },
  };
}

async function persist(row) {
  const cfg = getConfig();
  if (!cfg) {
    memory.unshift(row);
    if (memory.length > RETENTION) memory.length = RETENTION;
    return { ok: true, store: 'memory' };
  }
  return withTimeout(async (signal) => {
    const res = await fetch(`${cfg.url}/rest/v1/${cfg.table}`, {
      method: 'POST',
      headers: sbHeaders(cfg, { Prefer: 'return=minimal,resolution=merge-duplicates' }),
      body: JSON.stringify(row),
      signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      console.warn('[traces] supabase insert failed', res.status, t.slice(0, 300));
      return { ok: false, store: 'supabase', status: res.status };
    }
    return { ok: true, store: 'supabase' };
  });
}

async function listSummaries() {
  const cfg = getConfig();
  if (!cfg) return memory.map((r) => r.summary);
  return withTimeout(async (signal) => {
    const res = await fetch(`${cfg.url}/rest/v1/${cfg.table}?select=summary&order=created_at.desc&limit=${RETENTION}`, { headers: sbHeaders(cfg), signal });
    if (!res.ok) return [];
    const rows = await res.json();
    return rows.map((r) => r.summary);
  });
}

async function listDetails() {
  const cfg = getConfig();
  if (!cfg) return memory.map((r) => r.detail);
  return withTimeout(async (signal) => {
    const res = await fetch(`${cfg.url}/rest/v1/${cfg.table}?select=detail&order=created_at.desc&limit=${RETENTION}`, { headers: sbHeaders(cfg), signal });
    if (!res.ok) return [];
    const rows = await res.json();
    return rows.map((r) => r.detail);
  });
}

async function getById(id) {
  const cfg = getConfig();
  if (!cfg) return memory.find((r) => r.id === id)?.detail || null;
  return withTimeout(async (signal) => {
    const res = await fetch(`${cfg.url}/rest/v1/${cfg.table}?id=eq.${encodeURIComponent(id)}&select=detail&limit=1`, { headers: sbHeaders(cfg), signal });
    if (!res.ok) return null;
    const rows = await res.json();
    return rows[0]?.detail || null;
  });
}

async function clearAll() {
  const cfg = getConfig();
  if (!cfg) { memory.length = 0; return true; }
  return withTimeout(async (signal) => {
    const res = await fetch(`${cfg.url}/rest/v1/${cfg.table}?id=neq.__none__`, { method: 'DELETE', headers: sbHeaders(cfg), signal });
    return res.ok;
  });
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const allowed = ['https://gambitco.io', 'https://www.gambitco.io', 'https://gambitwebsite.vercel.app'];
  if (process.env.VERCEL_ENV !== 'production') allowed.push('http://localhost:3000', 'http://localhost:8099');
  if (origin.endsWith('.vercel.app')) allowed.push(origin);
  if (allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (origin && !allowed.includes(origin)) return res.status(403).json({ error: 'Forbidden origin' });

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://x');
      if (url.searchParams.get('debug')) {
        const cfg = getConfig();
        return res.status(200).json({ configured: !!cfg, store: cfg ? 'supabase' : 'memory', table: cfg?.table, memoryCount: memory.length });
      }
      if (url.searchParams.get('full')) {
        return res.status(200).json(await listDetails());
      }
      const id = url.searchParams.get('id');
      if (id) {
        const detail = await getById(id);
        if (!detail) return res.status(404).json({ error: 'Not found' });
        return res.status(200).json(detail);
      }
      return res.status(200).json(await listSummaries());
    }

    if (req.method === 'POST') {
      let body;
      try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { return res.status(400).json({ error: 'Invalid body' }); }
      if (!body || typeof body !== 'object' || !body.run) return res.status(400).json({ error: 'Missing run' });
      const row = toRow(body);
      const result = await persist(row);
      return res.status(result.ok ? 200 : 502).json({ ...result, id: row.id });
    }

    if (req.method === 'DELETE') {
      const ok = await clearAll();
      return res.status(200).json({ ok });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[traces] error', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
