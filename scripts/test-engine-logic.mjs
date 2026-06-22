// Deterministic engine checks. No API key, no model calls, no tokens spent.
// Proves the parts that must be exactly right: ROUTE detection, severity
// scoring, transcript role mapping, and the 15-turn fail cap.
//
//   node scripts/test-engine-logic.mjs

import {
  parseRoute,
  scoreRun,
  toPatientMessages,
  toTriageMessages,
  runConversation,
  computeReport,
  normalizePersona,
  parsePersonaUpload,
  parsePersonaRows,
  ENDPOINTS,
} from '../lib/triage-engine.js';
import { HEADACHE } from './fixtures.mjs';

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}
function eq(name, got, want) {
  check(`${name} (got ${JSON.stringify(got)})`, JSON.stringify(got) === JSON.stringify(want));
}

console.log('\nparseRoute');
eq('commits on a trailing ROUTE line', parseRoute('A few questions.\nROUTE: Video visit'), 'Video visit');
eq('case-insensitive endpoint match', parseRoute('ROUTE: emergency department'), 'Emergency department');
eq('no marker means keep going', parseRoute('What other symptoms do you have?'), null);
eq('invalid endpoint is rejected', parseRoute('ROUTE: Walk it off'), null);
eq('takes the last ROUTE line', parseRoute('ROUTE: Urgent care\non reflection\nROUTE: Specialist'), 'Specialist');
eq('all five endpoints parse', ENDPOINTS.map((e) => parseRoute(`ROUTE: ${e}`)), ENDPOINTS);

console.log('\nscoreRun');
eq('correct match', scoreRun({ expected: 'Video visit', chosen: 'Video visit', failed: false }), { routing_correct: true, severity: 'correct' });
eq('under-triage is lower acuity', scoreRun({ expected: 'Emergency department', chosen: 'Urgent care', failed: false }), { routing_correct: false, severity: 'under-triage' });
eq('over-triage is higher acuity', scoreRun({ expected: 'Self-care at home', chosen: 'Urgent care', failed: false }), { routing_correct: false, severity: 'over-triage' });
eq('failed run scores as fail', scoreRun({ expected: 'Video visit', chosen: null, failed: true }), { routing_correct: false, severity: 'fail' });

console.log('\nrole mapping (Anthropic needs first and last to be user turns)');
// At a patient call site the transcript ends on a triage question.
const patientSite = [
  { speaker: 'patient', text: 'my head really hurts' },
  { speaker: 'triage', text: 'How long has it lasted?' },
  { speaker: 'patient', text: 'since this morning' },
  { speaker: 'triage', text: 'Any vision changes?' },
];
const pm = toPatientMessages(patientSite);
check('patient view starts on user', pm[0].role === 'user');
check('patient view ends on user', pm[pm.length - 1].role === 'user');
check('patient view alternates roles', pm.every((m, i) => i === 0 || m.role !== pm[i - 1].role));
check('patient own turns are assistant (after the kickoff)', pm[1].role === 'assistant' && pm[1].content === 'my head really hurts');

// At a triage call site the transcript ends on a patient answer.
const triageSite = [
  { speaker: 'patient', text: 'my head really hurts' },
  { speaker: 'triage', text: 'How long has it lasted?' },
  { speaker: 'patient', text: 'since this morning' },
];
const tm = toTriageMessages(triageSite);
check('triage view starts on user', tm[0].role === 'user');
check('triage view ends on user', tm[tm.length - 1].role === 'user');
check('triage view alternates roles', tm.every((m, i) => i === 0 || m.role !== tm[i - 1].role));
check('triage own turns are assistant', tm[1].role === 'assistant' && tm[1].content === 'How long has it lasted?');
const firstPatient = toPatientMessages([]);
check('first patient call is a single user kickoff', firstPatient.length === 1 && firstPatient[0].role === 'user');

console.log('\nloop with a scripted triage (commits on the 4th question)');
{
  let triageCalls = 0;
  const scriptedCommitAt4 = async ({ system }) => {
    // Patient prompt contains the persona name; triage prompt does not.
    const isTriage = system.includes('clinical triage worker');
    if (!isTriage) return 'patient says something in character';
    triageCalls++;
    return triageCalls >= 4 ? 'Okay, I have enough.\nROUTE: Video visit' : `triage question ${triageCalls}`;
  };
  const result = await runConversation({
    persona: HEADACHE,
    callClaude: scriptedCommitAt4,
    models: { patient: 'm', triage: 'm' },
  });
  eq('commits to the scripted endpoint', result.chosen, 'Video visit');
  check('did not fail', result.failed === false);
  eq('stopped at turn 4', result.turns, 4);
  // opening + 4 triage + 3 patient answers = 8 entries
  eq('transcript length', result.transcript.length, 8);
  check('last entry is the committing triage turn', result.transcript[result.transcript.length - 1].speaker === 'triage');
}

console.log('\nloop that never commits (hits the 15-turn cap)');
{
  const neverCommits = async ({ system }) =>
    system.includes('clinical triage worker') ? 'one more question please' : 'patient answer';
  const result = await runConversation({
    persona: HEADACHE,
    callClaude: neverCommits,
    models: { patient: 'm', triage: 'm' },
  });
  check('no endpoint chosen', result.chosen === null);
  check('marked as failed', result.failed === true);
  eq('ran exactly 15 turns', result.turns, 15);
  eq('scores as fail', scoreRun({ expected: HEADACHE.expected_endpoint, chosen: result.chosen, failed: result.failed }), { routing_correct: false, severity: 'fail' });
}

console.log('\ncomputeReport (care routing accuracy is the headline)');
{
  const results = [
    { complaint: 'headache', routing_correct: true, severity: 'correct', fidelity_score: 8, comprehension: 7, satisfaction: 9, emotional_shift: 2 },
    { complaint: 'headache', routing_correct: false, severity: 'over-triage', fidelity_score: 6, comprehension: 6, satisfaction: 5, emotional_shift: -1 },
    { complaint: 'chest pain', routing_correct: false, severity: 'under-triage', fidelity_score: 9, comprehension: 8, satisfaction: 4, emotional_shift: -3 },
    { complaint: 'chest pain', routing_correct: true, severity: 'correct', fidelity_score: 7, comprehension: 9, satisfaction: 8, emotional_shift: 3 },
    { complaint: 'rash', routing_correct: false, severity: 'fail', fidelity_score: null, comprehension: null, satisfaction: null, emotional_shift: null },
  ];
  const rep = computeReport(results);
  eq('accuracy is correct / total as percent', rep.accuracy, 40);
  eq('correct count', rep.correct, 2);
  eq('under-triage count', rep.under, 1);
  eq('over-triage count', rep.over, 1);
  eq('fail-to-route count', rep.fail, 1);
  eq('average fidelity ignores nulls', rep.avgFidelity, 7.5);
  eq('average comprehension ignores nulls', rep.avgComprehension, 7.5);
  eq('average satisfaction ignores nulls', rep.avgSatisfaction, 6.5);
  eq('average emotional shift ignores nulls', rep.avgEmotionalShift, 0.3);
  eq('improved-outlook count', rep.improvedOutlook, 2);
  eq('breakdown groups by complaint', rep.byComplaint.length, 3);
  eq('empty set does not divide by zero', computeReport([]).accuracy, 0);
}

console.log('\nparsePersonaRows (Excel/CSV upload)');
{
  const rows = [
    { id: 'x1', display_name: 'Sam, 40', age: 40, sex: 'male', complaint: 'cough', expected_endpoint: 'Video visit', affirms: 'cough for a week ; worse at night', negates: 'no fever', clinical_truth: 'persistent cough', personality: 'calm', health_literacy: 'high', emotional_state: 'fine', speech_style: 'clear' },
    { 'Name': 'Lee, 22', 'Endpoint': 'Urgent care', 'Affirms': 'sprained wrist | swollen', complaint: 'wrist pain' },
  ];
  const out = parsePersonaRows(rows);
  eq('parses both rows', out.length, 2);
  eq('splits affirms on semicolons', out[0].affirms, ['cough for a week', 'worse at night']);
  eq('maps the character block', out[0].character.personality, 'calm');
  eq('tolerates alternate headers (Name/Endpoint)', out[1].display_name, 'Lee, 22');
  eq('splits affirms on pipes too', out[1].affirms, ['sprained wrist', 'swollen']);
  eq('keeps a valid endpoint from a header alias', out[1].expected_endpoint, 'Urgent care');
}

console.log('\npersona normalization and upload');
{
  const n = normalizePersona({ display_name: 'Sam, 40', complaint: 'cough', expected_endpoint: 'Bogus' }, 4);
  check('fills a stable id when missing', n.id === 'g005');
  check('rejects an invalid expected endpoint', n.expected_endpoint === null);
  check('defaults affirms/negates to arrays', Array.isArray(n.affirms) && Array.isArray(n.negates));
  check('fills the character block', n.character.personality === 'unspecified');
  const up = parsePersonaUpload(JSON.stringify([{ display_name: 'A, 1', complaint: 'x', expected_endpoint: 'Urgent care' }]));
  check('upload returns normalized personas', up.length === 1 && up[0].expected_endpoint === 'Urgent care');
  let threw = false;
  try { parsePersonaUpload('not json'); } catch { threw = true; }
  check('upload rejects non-JSON', threw);
  let threw2 = false;
  try { parsePersonaUpload('{"not":"an array"}'); } catch { threw2 = true; }
  check('upload rejects non-array JSON', threw2);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
