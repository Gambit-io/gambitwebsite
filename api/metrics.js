// Generic metrics writer for the Gambit analytics platform.
//
// Pushes any channel/campaign metric into channel_metrics so a single dashboard
// reads everything, regardless of source. The GA4 pipe, a Supermetrics Sheet
// reader, a custom script, or a manual form can all POST here. The metrics field
// is jsonb, so new metrics NEVER require a schema change.
//
// Same house pattern as api/crm.js: raw PostgREST upsert, gated by CRM_INGEST_KEY,
// Supabase creds from CRM_SUPABASE_* (falls back to SUPABASE_*).
//
//   POST /api/metrics          write one row or a batch
//   GET  /api/metrics?debug=1   config health check
//
// Body — a single row, an array of rows, or { rows: [...] }:
//   { "channel": "google_ads", "metric_date": "2026-07-08",
//     "campaign": "pe-launch",            // optional; defaults to "__default__"
//     "metrics": { "spend": 42.5, "clicks": 12, "impressions": 900 } }
//
// Upserts on (metric_date, channel, campaign), so re-posting the same day/channel
// updates that row instead of duplicating it.

const REQUEST_TIMEOUT_MS = 8000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ROWS = 1000;

function getConfig() {
  const url = process.env.CRM_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.CRM_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  const cleanUrl = url.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/i, '').replace(/\/+$/, '');
  return { url: cleanUrl, key: key.trim() };
}

function withTimeout(fn) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), REQUEST_TIMEOUT_MS);
  return Promise.resolve(fn(c.signal)).finally(() => clearTimeout(t));
}

// Validate + normalize one incoming row into a channel_metrics record.
function toRow(raw, i) {
  if (!raw || typeof raw !== 'object') throw new Error(`row ${i}: not an object`);
  const channel = typeof raw.channel === 'string' ? raw.channel.trim() : '';
  if (!channel) throw new Error(`row ${i}: channel is required`);
  const metric_date = typeof raw.metric_date === 'string' ? raw.metric_date.trim() : '';
  if (!DATE_RE.test(metric_date)) throw new Error(`row ${i}: metric_date must be YYYY-MM-DD`);
  const metrics = raw.metrics;
  if (metrics != null && (typeof metrics !== 'object' || Array.isArray(metrics))) {
    throw new Error(`row ${i}: metrics must be an object`);
  }
  // Non-null campaign so the unique key dedupes (Postgres treats NULLs as distinct).
  const campaign = (typeof raw.campaign === 'string' && raw.campaign.trim()) || '__default__';
  return { metric_date, channel, campaign, metrics: metrics || {} };
}

async function upsert(cfg, rows, signal) {
  const res = await fetch(`${cfg.url}/rest/v1/channel_metrics?on_conflict=metric_date,channel,campaign`, {
    method: 'POST',
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal,resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
    signal,
  });
  if (!res.ok) throw new Error(`supabase upsert ${res.status} ${(await res.text()).slice(0, 300)}`);
  return rows.length;
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

  const gate = process.env.CRM_INGEST_KEY;
  if (gate && req.headers['x-ingest-key'] !== gate) return res.status(401).json({ error: 'Unauthorized' });
  if (!cfg) return res.status(503).json({ error: 'Supabase not configured' });

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { return res.status(400).json({ error: 'Invalid body' }); }
  const list = Array.isArray(body) ? body : Array.isArray(body?.rows) ? body.rows : body ? [body] : [];
  if (!list.length) return res.status(400).json({ error: 'No rows provided' });
  if (list.length > MAX_ROWS) return res.status(400).json({ error: `Too many rows (max ${MAX_ROWS})` });

  let rows;
  try { rows = list.map(toRow); } catch (err) { return res.status(400).json({ error: String(err.message || err) }); }

  try {
    const written = await withTimeout((signal) => upsert(cfg, rows, signal));
    return res.status(200).json({ ok: true, written });
  } catch (err) {
    console.error('[metrics] upsert error', err);
    return res.status(502).json({ error: 'Write failed', detail: String(err.message || err).slice(0, 300) });
  }
}
