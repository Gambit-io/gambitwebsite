// Generic Claude proxy for the Clearstep triage demo.
// Holds ANTHROPIC_API_KEY server-side and forwards one /v1/messages call.
// The browser drives the multi-turn loop by calling this once per turn.
//
// Hardening: origin allowlist, per-IP rate limit, model allowlist, token cap,
// message + system sanitization. The DEMO_PASSWORD gate is layered on in a
// later build step.

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Only these models may be requested through the proxy, so the route cannot be
// abused to call arbitrary or expensive models.
const ALLOWED_MODELS = new Set(['claude-sonnet-4-6', 'claude-opus-4-8']);
const DEFAULT_MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS_CAP = 8192;
const SYSTEM_MAX = 20000;

// Simple in-memory rate limiting (resets on cold start, good enough for serverless).
const rateLimit = new Map();
const RATE_WINDOW = 60000; // 1 minute
const RATE_MAX = 120; // a single 10-patient batch is many calls, so allow headroom

function checkRate(ip) {
  const now = Date.now();
  const entry = rateLimit.get(ip);
  if (!entry || now - entry.start > RATE_WINDOW) {
    rateLimit.set(ip, { start: now, count: 1 });
    return true;
  }
  if (entry.count >= RATE_MAX) return false;
  entry.count++;
  return true;
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return null;
  if (messages.length === 0 || messages.length > 60) return null;
  const cleaned = [];
  for (const m of messages) {
    if (!m || typeof m !== 'object') return null;
    if (m.role !== 'user' && m.role !== 'assistant') return null;
    if (typeof m.content !== 'string') return null;
    if (m.content.length > 8000) return null;
    cleaned.push({ role: m.role, content: m.content });
  }
  // Anthropic requires the conversation to start and end on a user turn.
  if (cleaned[0].role !== 'user') return null;
  if (cleaned[cleaned.length - 1].role !== 'user') return null;
  return cleaned;
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const allowedOrigins = [
    'https://gambitco.io',
    'https://www.gambitco.io',
    'https://gambitwebsite.vercel.app',
  ];
  if (process.env.VERCEL_ENV !== 'production') {
    allowedOrigins.push('http://localhost:3000');
  }
  // Branch preview deployments get their own *.vercel.app host.
  if (origin.endsWith('.vercel.app')) {
    allowedOrigins.push(origin);
  }

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (origin && !allowedOrigins.includes(origin)) {
    return res.status(403).json({ error: 'Forbidden origin' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || 'unknown';
  if (!checkRate(ip)) {
    return res.status(429).json({ error: 'Too many requests. Slow down and try again in a minute.' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid request body' });
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const messages = sanitizeMessages(body.messages);
  if (!messages) {
    return res.status(400).json({ error: 'Invalid messages' });
  }

  const system = typeof body.system === 'string' ? body.system : '';
  if (system.length > SYSTEM_MAX) {
    return res.status(400).json({ error: 'System prompt too long' });
  }

  const model = ALLOWED_MODELS.has(body.model) ? body.model : DEFAULT_MODEL;
  let maxTokens = Number.isInteger(body.max_tokens) ? body.max_tokens : 1024;
  maxTokens = Math.max(1, Math.min(MAX_TOKENS_CAP, maxTokens));

  if (!ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const payload = {
      model,
      max_tokens: maxTokens,
      messages,
    };
    if (system) payload.system = system;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      console.error('Anthropic API error:', r.status, errText.slice(0, 500));
      return res.status(502).json({ error: 'Upstream error. Try again in a moment.' });
    }

    const data = await r.json();
    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    if (!text) {
      return res.status(502).json({ error: 'Empty response. Try again.' });
    }

    return res.status(200).json({ text, model });
  } catch (err) {
    console.error('Claude proxy error:', err);
    return res.status(500).json({ error: 'Something went wrong. Try again.' });
  }
}
