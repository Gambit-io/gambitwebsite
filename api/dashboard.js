// Read-only dashboard API for the Gambit analytics platform.
//
// Assembles everything the dashboard shell needs in one call, reading Supabase
// server-side (service key never touches the browser). Same house pattern as the
// other /api functions: raw PostgREST fetch, Supabase creds from CRM_SUPABASE_*.
//
//   GET /api/dashboard   -> { totals, pipeline, reply_rate, daily_outbound,
//                             channels, recent_events }
//
// Gated by DASHBOARD_KEY (falls back to CRM_INGEST_KEY) via header x-dashboard-key
// or ?key=. Read-only: it only ever SELECTs.

const REQUEST_TIMEOUT_MS = 8000;

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

function headers(cfg) {
  return { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` };
}

async function q(cfg, path, signal) {
  const res = await fetch(`${cfg.url}/rest/v1/${path}`, { headers: headers(cfg), signal });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

// Exact row count via PostgREST's Content-Range header, without pulling rows.
async function count(cfg, table, signal) {
  const res = await fetch(`${cfg.url}/rest/v1/${table}?select=id`, {
    headers: { ...headers(cfg), Prefer: 'count=exact', Range: '0-0' },
    signal,
  });
  const cr = res.headers.get('content-range') || '*/0';
  return Number(cr.split('/')[1]) || 0;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const gate = process.env.DASHBOARD_KEY || process.env.CRM_INGEST_KEY;
  const url = new URL(req.url, 'http://x');
  const provided = req.headers['x-dashboard-key'] || url.searchParams.get('key');
  if (gate && provided !== gate) return res.status(401).json({ error: 'Unauthorized' });

  const cfg = getConfig();
  if (!cfg) return res.status(503).json({ error: 'Supabase not configured' });

  try {
    const data = await withTimeout(async (signal) => {
      const [
        companies, contacts, deals, events,
        pipeline, reply_rate, daily_outbound, channels, recent_events,
      ] = await Promise.all([
        count(cfg, 'companies', signal),
        count(cfg, 'contacts', signal),
        count(cfg, 'deals', signal),
        count(cfg, 'events', signal),
        q(cfg, 'v_pipeline?select=*', signal),
        q(cfg, 'v_reply_rate?select=*', signal),
        q(cfg, 'v_daily_outbound?select=*&order=day.desc&limit=30', signal),
        q(cfg, 'channel_metrics?select=metric_date,channel,campaign,metrics&order=metric_date.desc&limit=200', signal),
        q(cfg, 'events?select=occurred_at,type,channel,actor&order=occurred_at.desc&limit=20', signal),
      ]);
      return {
        totals: { companies, contacts, deals, events },
        pipeline, reply_rate, daily_outbound, channels, recent_events,
        generated_at: new Date().toISOString(),
      };
    });
    return res.status(200).json(data);
  } catch (err) {
    console.error('[dashboard] error', err);
    return res.status(502).json({ error: 'Read failed', detail: String(err.message || err).slice(0, 200) });
  }
}
