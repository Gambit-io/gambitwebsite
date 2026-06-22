// Smoke-test the engine against a live /api/claude (no local key needed; the
// key lives in Vercel). Server-side caller sends no Origin header, so it passes
// the proxy's origin allowlist.
//
//   node scripts/smoke-preview.mjs <baseUrl> ping   # one cheap call
//   node scripts/smoke-preview.mjs <baseUrl> run     # full headache run

import { runOne } from '../lib/triage-engine.js';
import { HEADACHE } from './fixtures.mjs';

const BASE = (process.argv[2] || '').replace(/\/$/, '');
const MODE = process.argv[3] || 'run';
if (!BASE) {
  console.error('Usage: node scripts/smoke-preview.mjs <baseUrl> [ping|run]');
  process.exit(1);
}

const MODELS = {
  patient: 'claude-sonnet-4-6',
  triage: 'claude-sonnet-4-6',
  evaluator: 'claude-opus-4-8',
};

async function callClaude({ system, messages, model, max_tokens }) {
  const r = await fetch(`${BASE}/api/claude`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, messages, model, max_tokens }),
  });
  const text = await r.text();
  if (!r.ok) {
    throw new Error(`HTTP ${r.status} from /api/claude: ${text.slice(0, 300)}`);
  }
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error(`Non-JSON response (likely an auth/protection page): ${text.slice(0, 200)}`); }
  return data.text;
}

if (MODE === 'ping') {
  console.log(`Pinging ${BASE}/api/claude ...`);
  const out = await callClaude({
    system: 'You are a connectivity check.',
    messages: [{ role: 'user', content: 'Reply with the single word: pong.' }],
    model: 'claude-sonnet-4-6',
    max_tokens: 10,
  });
  console.log('Response:', JSON.stringify(out));
  console.log('\nProxy reachable and the key works.');
  process.exit(0);
}

function onEvent(e) {
  if (e.type !== 'turn') return;
  const who = e.speaker === 'patient' ? 'PATIENT WORKER' : 'TRIAGE WORKER';
  const tag = e.turn === 0 ? '(opening)' : `(turn ${e.turn})`;
  console.log(`\n${who} ${tag}\n${e.text}`);
  if (e.route) console.log(`  >> committed: ${e.route}`);
}

console.log(`\nHeadache persona (${HEADACHE.display_name}). Expected: ${HEADACHE.expected_endpoint}\n${'='.repeat(60)}`);
const result = await runOne({ persona: HEADACHE, callClaude, models: MODELS, onEvent });
console.log(`\n${'='.repeat(60)}\nRUN RESULT`);
console.log(JSON.stringify({
  expected_endpoint: result.expected_endpoint,
  chosen_endpoint: result.chosen_endpoint,
  routing_correct: result.routing_correct,
  severity: result.severity,
  failed: result.failed,
  turns: result.turns,
  fidelity_score: result.fidelity_score,
  verdict: result.verdict,
}, null, 2));
