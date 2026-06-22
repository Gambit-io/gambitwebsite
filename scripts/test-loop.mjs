// Live console run of one full triage simulation against the headache persona.
// Calls Anthropic directly (the browser will go through /api/claude instead).
//
// Needs a key. Either:
//   export ANTHROPIC_API_KEY=sk-ant-...   (or set it in .env.local)
//   node scripts/test-loop.mjs
// Or pull it from Vercel first:
//   vercel env pull .env.local && node scripts/test-loop.mjs

import { readFileSync } from 'node:fs';
import { runOne } from '../lib/triage-engine.js';
import { HEADACHE } from './fixtures.mjs';

const MODELS = {
  patient: 'claude-sonnet-4-6',
  triage: 'claude-sonnet-4-6',
  evaluator: 'claude-opus-4-8',
};

// Load .env.local if present, without adding a dependency.
function loadEnvLocal() {
  try {
    const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch { /* no .env.local, fine */ }
}
loadEnvLocal();

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) {
  console.error('\nNo ANTHROPIC_API_KEY found. Set it in the shell or .env.local, then rerun.\n');
  process.exit(1);
}

async function callClaude({ system, messages, model, max_tokens }) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, max_tokens, system, messages }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`Anthropic ${r.status}: ${t.slice(0, 300)}`);
  }
  const data = await r.json();
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}

function onEvent(e) {
  if (e.type !== 'turn') return;
  const who = e.speaker === 'patient' ? 'PATIENT WORKER' : 'TRIAGE WORKER';
  const tag = e.turn === 0 ? '(opening)' : `(turn ${e.turn})`;
  console.log(`\n${who} ${tag}\n${e.text}`);
  if (e.route) console.log(`  >> committed: ${e.route}`);
}

console.log(`\nRunning headache persona (${HEADACHE.display_name}). Expected endpoint: ${HEADACHE.expected_endpoint}\n${'='.repeat(60)}`);

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
console.log('');
