// GA4 -> Supabase daily sync for the Gambit analytics platform.
//
// Pulls Google Analytics 4 metrics via the Data API and upserts one row per day
// into channel_metrics (channel='ga4'), landing next to the CRM data so a single
// dashboard reads everything. Zero dependencies: the service-account JWT is signed
// with Node's built-in crypto, and every HTTP call is raw fetch (same house style
// as api/crm.js / api/traces.js).
//
//   GET /api/ga4-sync            sync yesterday (cron target)
//   GET /api/ga4-sync?days=30    backfill the last 30 days
//
// Secured by CRON_SECRET: Vercel Cron automatically sends
// `Authorization: Bearer <CRON_SECRET>`; manual calls must send the same, or
// header `x-cron-key: <CRON_SECRET>`.
//
// Env vars:
//   GA4_PROPERTY_ID    numeric property id (NOT the G-XXXX measurement id)
//   GA4_CLIENT_EMAIL   service-account email
//   GA4_PRIVATE_KEY    service-account private key (with literal \n escapes)
//   CRON_SECRET        shared secret gating this endpoint
//   CRM_SUPABASE_URL / CRM_SUPABASE_SERVICE_KEY  (falls back to SUPABASE_*)

import crypto from 'crypto';

const REQUEST_TIMEOUT_MS = 15000;
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GA4_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

function getSupabase() {
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

const b64url = (input) => Buffer.from(input).toString('base64url');

// Sign a service-account JWT and exchange it for a short-lived access token.
async function getAccessToken(signal) {
  const email = process.env.GA4_CLIENT_EMAIL;
  const rawKey = process.env.GA4_PRIVATE_KEY;
  if (!email || !rawKey) throw new Error('GA4_CLIENT_EMAIL / GA4_PRIVATE_KEY not set');
  const privateKey = rawKey.replace(/\\n/g, '\n');

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = { iss: email, scope: GA4_SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const signature = crypto.createSign('RSA-SHA256').update(signingInput).sign(privateKey);
  const jwt = `${signingInput}.${b64url(signature)}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
    signal,
  });
  if (!res.ok) throw new Error(`token exchange ${res.status} ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).access_token;
}

// Ask GA4 for daily site totals over [startDate, endDate].
async function runReport(token, startDate, endDate, signal) {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) throw new Error('GA4_PROPERTY_ID not set');
  const body = {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'date' }],
    metrics: [
      { name: 'sessions' },
      { name: 'activeUsers' },
      { name: 'screenPageViews' },
      { name: 'conversions' },
      { name: 'engagedSessions' },
    ],
    orderBys: [{ dimension: { dimensionName: 'date' } }],
  };
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`runReport ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

// GA4 returns date as "YYYYMMDD"; channel_metrics wants a real date.
function ga4DateToISO(d) {
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

function toRows(report) {
  const names = (report.metricHeaders || []).map((h) => h.name);
  return (report.rows || []).map((row) => {
    const date = ga4DateToISO(row.dimensionValues[0].value);
    const metrics = {};
    names.forEach((name, i) => { metrics[name] = Number(row.metricValues[i].value) || 0; });
    // Non-null sentinel campaign so the (date, channel, campaign) unique key dedupes
    // the daily-total rows across re-runs (Postgres treats NULLs as distinct).
    return { metric_date: date, channel: 'ga4', campaign: '__site__', metrics };
  });
}

async function upsert(sb, rows, signal) {
  if (!rows.length) return 0;
  const res = await fetch(`${sb.url}/rest/v1/channel_metrics?on_conflict=metric_date,channel,campaign`, {
    method: 'POST',
    headers: {
      apikey: sb.key,
      Authorization: `Bearer ${sb.key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal,resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
    signal,
  });
  if (!res.ok) throw new Error(`supabase upsert ${res.status} ${(await res.text()).slice(0, 300)}`);
  return rows.length;
}

// End = yesterday (today's GA4 data is still settling). Start = end - (days-1).
function dateRange(days) {
  const end = new Date(Date.now() - 24 * 3600 * 1000);
  const start = new Date(end.getTime() - (Math.max(1, days) - 1) * 24 * 3600 * 1000);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { startDate: iso(start), endDate: iso(end) };
}

export default async function handler(req, res) {
  // Gate: Vercel Cron sends Authorization: Bearer <CRON_SECRET>. Manual callers
  // may send that or x-cron-key. If CRON_SECRET is unset, refuse (fail closed).
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : req.headers['x-cron-key'];
  if (!secret || provided !== secret) return res.status(401).json({ error: 'Unauthorized' });

  const sb = getSupabase();
  if (!sb) return res.status(503).json({ error: 'Supabase not configured' });

  const days = Math.min(400, Math.max(1, parseInt(new URL(req.url, 'http://x').searchParams.get('days') || '1', 10)));
  const { startDate, endDate } = dateRange(days);

  try {
    const result = await withTimeout(async (signal) => {
      const token = await getAccessToken(signal);
      const report = await runReport(token, startDate, endDate, signal);
      const rows = toRows(report);
      const written = await upsert(sb, rows, signal);
      return { written, startDate, endDate };
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('[ga4-sync] error', err);
    return res.status(502).json({ error: 'Sync failed', detail: String(err.message || err).slice(0, 300) });
  }
}
